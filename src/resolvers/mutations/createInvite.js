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
      }/join?joinToken=${inviteToken}">Click Here to join</a>
      <h6>This message was sent because a confirmed user of hausmix.com would like you to join their household.</h6>
      <h6>If you do not want this invitation, ignore this email and you will not be contacted again.</h6>
      <h6>Additionally, if you do not confirm your invitation, your email address will only be used in our 'Do not contact' list to ensure no further emails are sent to you. Your email will not be used for any other purpose.</h6>
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

exports.sendNewUserConfirmationEmail = async (invitedEmail, inviteToken) => {
  return await sesClient.sendEmail(
    {
      to: invitedEmail,
      from: process.env.FROM_EMAIL,
      subject: "Invitation to Hausmix!",
      message: buildFormattedEmail(
        `Thank you for signing up to Hausmix!
      \n\n
        In order to use your account, you must confirm your email address by clicking the link below and following the instructions on the confirmation page.
        \n\n
      <a href="${
        process.env.FRONTEND_URL
      }/confirm?confirmToken=${inviteToken}">Confirm your account</a>
      <h6>This message was sent because your email was used to create an account on hausmix.com</h6>
      <h6>If you did not create this account, ignore this email and you will not be contacted again.</h6>
      <h6>If you do not confirm this account, the account will be deactivated and your email address will only be used in our 'Do not contact' list to ensure no further emails are sent to you. Your email will not be used for any other purpose.</h6>

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
