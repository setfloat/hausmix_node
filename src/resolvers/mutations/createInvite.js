const { buildFormattedEmail, sesClient } = require("../../sesmail.js");
exports.checkIfEmailAlreadyInvitedToHousehold = async (
  ctx,
  invitedEmail,
  householdId
) => {
  const alreadyInvited = await ctx.db.query.invites(
    {
      where: { household: { id: householdId }, invitedEmail }
    },
    `{
        id
      }`
  );
  if (alreadyInvited.length) {
    throw new Error(
      "This person has already received an invitation to this household."
    );
  }
};

exports.preventSendingTooManyEmails = async (ctx, invitedEmail) => {
  const notUserAlreadyInvited = await ctx.db.query.invites(
    {
      where: { invitedEmail }
    },
    `{
        id
        inviteStatus
        household {
          id
        }
      }`
  );

  const tooManyInvites =
    (await notUserAlreadyInvited.filter(invite => {
      if (invite.inviteStatus === "PENDING") {
        return true;
      }
      return false;
    }).length) >= 2
      ? true
      : false;

  const deniedInvite = (await notUserAlreadyInvited.filter(invite => {
    if (invite.inviteStatus === "DENIED") {
      return true;
    }
    return false;
  }).length)
    ? true
    : false;

  if (tooManyInvites || deniedInvite) {
    throw new Error(
      "This email cannot receive additional invites at this time."
    );
  }
};

exports.sendInviteEmail = async (invitedEmail, inviteToken) => {
  return await sesClient.sendEmail(
    {
      to: invitedEmail,
      from: process.env.FROM_EMAIL,
      subject: "Invitation to Hausmix!",
      message: buildFormattedEmail(
        `You have been invited to join a Hausmix household!
      \n\n
      <a href="${
        process.env.FRONTEND_URL
      }/join?joinToken=${inviteToken}">Click Here to join</a>`
      ),
      amazon: "https://email.us-east-1.amazonaws.com"
    },
    function(err, data, res) {
      if (err) {
        throw new Error("Email failed to send");
      }
      return true;
    }
  );
};

exports.sendNewUserConfirmationEmail = async (invitedEmail, inviteToken) => {
  return await sesClient.sendEmail(
    {
      to: invitedEmail,
      from: process.env.FROM_EMAIL,
      subject: "Invitation to Hausmix!",
      message: buildFormattedEmail(
        `Thank you for signing up to Hausmix!
      \n\n
        In order to use your account, you must confirm your email address.
        \n\n
      <a href="${
        process.env.FRONTEND_URL
      }/confirm?confirmToken=${inviteToken}">Confirm your account</a>
      \n\n
      If you did not create this account, ignore this email and you will not be contacted again.
      \n
      Unconfirmed accounts will be deactivated and the email address will be only used in our 'Do not contact' list. They will not be used for any other purpose.
      `
      ),
      amazon: "https://email.us-east-1.amazonaws.com"
    },
    function(err, data, res) {
      if (err) {
        throw new Error("Email failed to send");
      }
      return true;
    }
  );
};
