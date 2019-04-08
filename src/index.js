const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
require("dotenv").config({ path: ".env" });
const createServer = require("./createServer");
const db = require("./db");

const server = createServer();

// TODO Use express middleware to handle cookies (JWT)
server.express.use(cookieParser());

// TODO Use express middleware to populate current User

server.express.use((req, res, next) => {
  const { token } = req.cookies;

  if (token) {
    const { userId } = jwt.verify(token, process.env.APP_SECRET);
    req.userId = userId;
  }

  next();
});

server.express.use(async (req, res, next) => {
  if (!req.userId) return next();
  const user = await db.query
    .user(
      { where: { id: req.userId } },
      "{ id, permissions, email, name, households { id }, householdsManaged  { id }, createdChores  { id }, assigned  { id }, currentAssigned  { id } }"
    )
    .catch(err => console.log(err));

  console.log({ user });
  req.user = user;
  next();
});

server.start(
  {
    cors: {
      credentials: true,
      origin: process.env.FRONTEND_URL
    }
  },
  deets => {
    console.log(`Server is now running on http://localhost/${deets.port}`);
  }
);
