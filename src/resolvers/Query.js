const isAfter = require("date-fns/is_after");

const Query = {
  loggedInUser(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      return null;
    }
    return ctx.db.query.user(
      {
        where: { id: ctx.request.userId }
      },
      info
    );
  },
  async invite(parent, args, ctx, info) {
    const invite = await ctx.db.query.invites(
      {
        where: {
          inviteToken: args.inviteToken,
          AND: [{ inviteTokenExpiry_gt: Date.now() }]
        }
      },
      info
    );

    if (!invite.length) {
      throw new Error("No valid invite exists");
    }

    return invite[0];
  },

  async currentHousehold(parent, args, ctx, info) {
    // Checks for newly overdue chores and updates them to OVERDUE if necessary.
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to perform this action.");
    }

    function getHousehold(ctx, id, info) {
      return ctx.db.query.households(
        {
          where: { id, houseMembers_some: { id: ctx.request.userId } }
        },
        info
      );
    }

    let household = await getHousehold(ctx, args.id, info);
    const overdueInstances = await household[0].choreInstances.filter(
      instance => {
        if (
          isAfter(Date.now(), instance.deadline) &&
          instance.completionStatus === "INCOMPLETE"
        ) {
          return true;
        } else {
          return false;
        }
      }
    );

    if (overdueInstances.length) {
      const overIDs = await overdueInstances.map(instance => instance.id);
      const updatedInstance = await ctx.db.mutation.updateManyChoreInstances({
        where: { id_in: overIDs },
        data: {
          completionStatus: "OVERDUE"
        }
      });
      household = await getHousehold(ctx, args.id, info);
    }

    return household[0];
  },

  async choreTemplate(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to perform this action.");
    }

    const choreTemplates = await ctx.db.query.choreTemplates(
      {
        where: {
          id: args.id
        }
      },
      info
    );

    return choreTemplates[0];
  },

  async houseSingleUserDebts(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to perform this action.");
    }
    const userId = ctx.request.userId;
    const { householdId, specificUserId } = args;
    const userDebts = await ctx.db.query.debts(
      {
        where: {
          settled_in: ["UNPAID", "PARTIAL", "OVERPAID"],
          household: { id: householdId },
          debtor: {
            id_in: [userId, specificUserId]
          },
          creditor: {
            id_in: [userId, specificUserId]
          }
        }
      },
      info
    );

    if (!userDebts.length || userDebts === undefined) {
      return null;
    }

    return userDebts;
  }
};

module.exports = Query;
