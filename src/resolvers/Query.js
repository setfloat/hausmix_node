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
  async users(parent, args, ctx, info) {
    // if (!ctx.request.userId) {
    //   throw new Error("You must be logged in to perform this action.");
    // }

    // 2. Check if the user has the permissiosn to query all the users.
    // hasPermission(ctx.request.user, ["ADMIN", "PERMISSIONUPDATE"]);

    // 3. Query the users if permitted.
    return ctx.db.query.users({}, info); // with the users method the first argument for where is left empty as we want to query all of the users. the second info argument includes the graphql query that contains the fields we are requesting from the front end.
    // basically the where limits which rows are returned and the graphql query limits which columns are returned.
  }
};

module.exports = Query;
