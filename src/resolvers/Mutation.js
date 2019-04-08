const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Mutation = {
  async createChore(parent, args, ctx, info) {
    // if (!ctx.request.userId) {
    //     throw new Error("You must be logged in to perform this action.");
    //   }

    const chore = await ctx.db.mutation.createChore({
      data: {
        createdBy: {
          connect: {
            id: ctx.request.userId
          }
        },
        ...args
      }
    });
  },

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

    return user;
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
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year cookie
    });

    return user;
  },
  signOut(parent, args, ctx, info) {
    ctx.response.clearCookie("token");
    return { message: "Successfully signed out. Thanks for stopping by!" };
  }
};

module.exports = Mutation;
