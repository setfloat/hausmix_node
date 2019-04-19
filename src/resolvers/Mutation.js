const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const { promisify } = require("util");
const {
  sendInviteEmail,
  preventSendingTooManyEmails,
  checkIfEmailAlreadyInvitedToHousehold
} = require("./mutations/createInvite");

const createInviteValidations = () => {};

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
          assigned: [],
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
          ...args
        }
      },
      info
    );
    console.log({ successfulCreateHousehold: household });

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
      // 1. Check if invitedEmail is part of current household OR is adding themself
      if (invitedIsUser.households.includes(householdId)) {
        throw new Error("This person is already a member of your household!");
      }
      // 2. User has already been invited to household.
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
      `{ id household { id name } invitedBy { id name } invitedEmail invitedIsUser inviteStatus inviteToken inviteTokenExpiry }`
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
          assigned: [],
          currentAssigned: []
        }
      },
      info
    );

    createJWTAndCookie(user.id, ctx);

    return user;
  },

  async createChore(parent, args, ctx, info) {
    // if (!ctx.request.userId) {
    //     throw new Error("You must be logged in to perform this action.");
    //   }

    const chore = await ctx.db.mutation.createChore(
      {
        data: {
          createdBy: {
            connect: {
              id: ctx.request.userId
            }
          },
          ...args
        }
      },
      info
    );
  }
};

module.exports = Mutation;
