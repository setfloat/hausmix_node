const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const { promisify } = require("util");
const {
  sendInviteEmail,
  preventSendingTooManyEmails,
  checkIfEmailAlreadyInvitedToHousehold
} = require("./mutations/createInvite");
const {
  createNewDebts,
  choreInstancesToUpdateQuery,
  updatedInstanceFunc,
  overdueCreateInstanceFromRepeatingFunc
} = require("./mutations/thievingMarkComplete");

const {
  updateChoreInstance,
  markCompletechoreInstancesToUpdateQuery,
  createInstanceFromRepeatingFunc
} = require("./mutations/markcomplete");
const Query = require("./Query");

const createJWTAndCookie = (userId, ctx) => {
  const token = jwt.sign({ userId: userId }, process.env.APP_SECRET);

  ctx.response.cookie("token", token, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year cookie
  });
};

const Mutation = {
  async signIn(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();

    const user = await ctx.db.query.user({
      where: { email: args.email }
    });
    if (!user) {
      throw new Error(`No such user found for ${args.email}`);
    }
    const valid = await bcrypt.compare(args.password, user.password);
    if (!valid) {
      throw new Error("Invalid Password");
    }
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
    delete args.password;
    delete user.password;
    console.log({ successfulSignIn: user });

    return user;
  },

  signOut(parent, args, ctx, info) {
    ctx.response.clearCookie("token");
    return { message: "Successfully signed out. Thanks for stopping by!" };
  },

  async signUp(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();

    const password = await bcrypt.hash(args.password, 14);
    delete args.password;

    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ["USER"] },
          households: [],
          householdsManaged: [],
          createdChores: [],
          currentAssigned: []
        }
      },
      info
    );

    createJWTAndCookie(user.id, ctx);

    return user;
  },

  async createHousehold(parent, args, ctx, info) {
    const { userId } = ctx.request;
    const household = await ctx.db.mutation.createHousehold(
      {
        data: {
          headsOfHouse: { connect: { id: userId } },
          houseMembers: { connect: { id: userId } },
          debts: [],
          choreTemplates: [],
          choreInstances: [],
          ...args
        }
      },
      info
    );

    return household;
  },

  async createInvite(parent, args, ctx, info) {
    const { userId } = ctx.request;
    const { householdId, invitedEmail } = args;
    const invitedIsUser = await ctx.db.query.user(
      {
        where: { email: invitedEmail }
      },
      `{ id households { id } }`
    );

    if (invitedIsUser) {
      // 1. Check if invitedEmail is part of current household
      if (invitedIsUser.households.includes(householdId)) {
        throw new Error("This person is already a member of your household!");
      }
      // 2. User is part of a different household
      throw new Error("Multiple households are not yet supported");
    }

    await checkIfEmailAlreadyInvitedToHousehold(ctx, invitedEmail, householdId);

    if (!invitedIsUser) {
      await preventSendingTooManyEmails(ctx, invitedEmail);
    }

    // create the invite tokens
    const randomBytesPromisified = promisify(randomBytes);
    const inviteToken = (await randomBytesPromisified(20)).toString("hex");
    const inviteTokenExpiry = Date.now() + 1000 * 60 * 60 * 24 * 180; // 6 months

    // create the invite
    const invite = await ctx.db.mutation.createInvite(
      {
        data: {
          invitedEmail,
          invitedIsUser: invitedIsUser ? true : false,
          inviteStatus: "PENDING",
          household: { connect: { id: householdId } },
          invitedBy: { connect: { id: userId } },
          inviteToken,
          inviteTokenExpiry
        }
      },
      info
    );

    // send an email to the user.
    await sendInviteEmail(invitedEmail, inviteToken);

    return invite;
  },

  async acceptInvite(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();

    const dbInvite = await ctx.db.query.invites({
      where: {
        inviteToken: args.inviteToken,
        AND: [
          { inviteTokenExpiry_gt: Date.now() },
          { invitedEmail: args.email }
        ]
      }
    });

    if (!dbInvite.length) {
      throw new Error("Invalid Token");
    }

    const password = await bcrypt.hash(args.password, 14).catch(err => {
      throw new Error("Invalid password");
    });

    delete args.password;

    const updatedInvite = await ctx.db.mutation.updateInvite(
      {
        where: {
          inviteToken: args.inviteToken
        },
        data: {
          inviteStatus: "ACCEPTED",
          inviteTokenExpiry: Date.now()
        }
      },
      `{ id household { id name houseMembers { id } } invitedBy { id name } invitedEmail invitedIsUser inviteStatus inviteToken inviteTokenExpiry }`
    );

    delete args.inviteToken;

    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ["USER"] },
          households: { connect: { id: updatedInvite.household.id } },
          householdsManaged: [],
          createdChores: [],
          currentAssigned: [],
          debts: [],
          credits: []
        }
      },
      info
    );

    createJWTAndCookie(user.id, ctx);

    return user;
  },

  async createChoreTemplate(parent, args, ctx, info) {
    const { userId } = ctx.request;

    const choreTemplate = await ctx.db.mutation.createChoreTemplate(
      {
        data: {
          ...args,
          household: { connect: { id: args.household } },
          createdBy: { connect: { id: userId } },
          instances: []
        }
      },
      info
    );
    return choreTemplate;
  },

  async createAssignChoreMutation(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to complete this action");
    }

    const currentAssignedConnect = await args.currentAssigned.map(elem => ({
      id: elem
    }));

    const choreInstance = await ctx.db.mutation.createChoreInstance(
      {
        data: {
          ...args,
          choreTemplate: { connect: { id: args.choreTemplate } },
          household: { connect: { id: args.household } },
          currentAssigned: { connect: currentAssignedConnect }
        }
      },
      info
    );

    return choreInstance;
  },

  async markComplete(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to complete this action");
    }

    const choreInstanceToUpdate = await markCompletechoreInstancesToUpdateQuery(
      ctx,
      args,
      ctx.request.userId,
      info
    );

    if (!choreInstanceToUpdate || !choreInstanceToUpdate.length) {
      throw new Error("404");
    }

    const updatedChoreInstance = await updateChoreInstance(ctx, args);

    if (updatedChoreInstance.choreTemplate.frequency !== "Once") {
      const createInstanceFromRepeating = await createInstanceFromRepeatingFunc(
        ctx,
        updatedChoreInstance,
        info
      );
      return createInstanceFromRepeating;
    }

    return updatedChoreInstance;
  },

  async thievingMarkComplete(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to complete this action");
    }
    const { userId } = ctx.request;

    const choreInstancesToUpdate = await choreInstancesToUpdateQuery(
      ctx,
      args,
      userId
    );

    if (!choreInstancesToUpdate.length) {
      throw new Error("This chore cannot be stolen at this time.");
    }

    // 1. create debt
    const newDebts = await createNewDebts(
      choreInstancesToUpdate[0],
      ctx,
      args,
      userId
    );

    // 2. mark chore Complete
    const updatedInstance = await updatedInstanceFunc(
      ctx,
      args.id,
      userId,
      info
    );

    // 3. Create new instance if the chore repeats itself
    if (updatedInstance.choreTemplate.frequency !== "Once") {
      const createInstanceFromRepeating = await overdueCreateInstanceFromRepeatingFunc(
        ctx,
        updatedInstance,
        info
      );

      return createInstanceFromRepeating;
    }

    return updatedInstance;
  },

  async cancelDebt(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to complete this action");
    }
    const { userId } = ctx.request;

    const cancelledDebt = await ctx.db.mutation.updateManyDebts({
      data: {
        settled: "CANCELLED",
        amountPaid: 0
      },
      where: {
        settled_not: "CANCELLED",
        id: args.id,
        OR: [
          { creditor: { id: userId } },
          { debtor: { id: userId } },
          { household: { headsOfHouse_some: { id: userId } } }
        ]
      }
    });
    if (cancelledDebt.count === 0) {
      throw new Error("No debt found");
    }
    if (cancelledDebt) {
      return { id: args.id };
    } else {
      throw new Error("Something didn't work right");
    }
  },

  async settleDebt(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to complete this action");
    }
    const { userId } = ctx.request;

    const debtToSettle = await ctx.db.query.debt(
      {
        where: {
          id: args.id
        }
      },
      `{ amount amountPaid settled }`
    );

    const settledDebt = await ctx.db.mutation.updateManyDebts({
      data: {
        settled: "PAID",
        amountPaid: debtToSettle.amount
      },
      where: {
        settled_in: ["UNPAID", "PARTIAL"],
        id: args.id,
        OR: [
          { creditor: { id: userId } },
          { debtor: { id: userId } },
          { household: { headsOfHouse_some: { id: userId } } }
        ]
      }
    });
    if (settledDebt.count === 0) {
      throw new Error("No debt found");
    }
    if (settledDebt) {
      return { id: args.id };
    } else {
      throw new Error("Something Error. Please Try again later.");
    }
  },

  async unpayDebt(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to complete this action");
    }
    const { userId } = ctx.request;

    const cancelledDebt = await ctx.db.mutation.updateManyDebts({
      data: {
        settled: "UNPAID"
      },
      where: {
        settled_not: "UNPAID",
        id: args.id,
        OR: [
          { creditor: { id: userId } },
          { debtor: { id: userId } },
          { household: { headsOfHouse_some: { id: userId } } }
        ]
      }
    });
    if (cancelledDebt.count === 0) {
      throw new Error("No debt found");
    }
    if (cancelledDebt) {
      return { id: args.id };
    } else {
      throw new Error("Something didn't work right");
    }
  },

  async settleAllDebts(parent, args, ctx, info) {
    const { householdId, specificUserId, totalPayment } = args;

    const userDebts = await Query.houseSingleUserDebts(
      parent,
      args,
      ctx,
      `{
        id
        amount
        amountPaid
        debtor {
          id
          name
        }
        creditor {
          id
          name
        }
      }`
    );

    // add debts and compare added debts to totalPayment to ensure equality.
    const totalDebts = await userDebts.reduce(
      (accumulator, debt, index, arr) => {
        if (debt.debtor.id === specificUserId) {
          return accumulator + debt.amount;
        } else {
          return accumulator - debt.amount;
        }
      },
      0
    );

    // Ensure client and server are in sync.
    if (totalDebts !== totalPayment) {
      throw new Error("Total debts do not match total payments.");
    }

    // sort debts so credits are first in the array. In the future, this will allow for partial payments.
    const sortedDebts = await userDebts.sort((a, b) => a.amount - b.amount);

    return await Promise.all(
      sortedDebts.map(async debtToPay => {
        const updatedDebt = await ctx.db.mutation.updateDebt({
          where: {
            id: debtToPay.id
          },
          data: {
            amountPaid: debtToPay.amount,
            settled: "PAID"
          }
        });

        return updatedDebt;
      })
    );
  }
};

module.exports = Mutation;
