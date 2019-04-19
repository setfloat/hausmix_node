const { makeANiceEmail, transport } = require("../../mail.js");

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

exports.sendInviteEmail = (invitedEmail, inviteToken) => {
  return transport.sendMail({
    from: "setfloat@gmail.com",
    to: invitedEmail,
    subject: `Invitation to chorefront household`,
    html: makeANiceEmail(
      `You have been invited to join a chorefront household!
        \n\n
        <a href="${
          process.env.FRONTEND_URL
        }/join?joinToken=${inviteToken}">Click Here to join</a>`
    )
  });
};
