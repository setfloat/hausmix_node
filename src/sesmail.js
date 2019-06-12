const ses = require("node-ses");

const sesClient = ses.createClient({
  key: process.env.ACCESS_KEY_ID,
  secret: process.env.SECRET_ACCESS_KEY
});

exports.buildFormattedEmail = text => `
    <div className="email" style="
        border: 1px solid black;
        padding: 24px;
        font-family: sans-serif;
        line-height: 2;
        font-size: 22px;
    ">
        <h2>Welcome to Hausmix!</h2>
        <p>${text}</p>

        <h4>-Hausmix</h4>
    </div>
`;

exports.sesClient = sesClient;
