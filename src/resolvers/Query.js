const { forwardTo } = require("prisma-binding");

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
    // console.log({ inviteToken: args.inviteToken });
    // if (!ctx.request.userId) {
    //   throw new Error(
    //     "TODO< Create a backend path for users to receive no invites"
    //   );
    // }

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

  async users(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to perform this action.");
    }

    // 2. Check if the user has the permissions to query all the users.
    // hasPermission(ctx.request.user, ["ADMIN", "PERMISSIONUPDATE"]);

    // 3. Query the users if permitted.
    return ctx.db.query.users({}, info); // with the users method the first argument for where is left empty as we want to query all of the users. the second info argument includes the graphql query that contains the fields we are requesting from the front end.
    // basically the where limits which rows are returned and the graphql query limits which columns are returned.
  },
  async currentHousehold(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error("You must be logged in to perform this action.");
    }

    const household = await ctx.db.query.households(
      {
        where: { id: args.id, houseMembers_some: { id: ctx.request.userId } }
      },
      info
    );

    console.log(household);

    return household[0];
  }
};

module.exports = Query;
