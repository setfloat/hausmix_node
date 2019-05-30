const { addDays } = require("date-fns");

const frequencyResult = frequency => {
  switch (frequency) {
    case "Once":
      return 7;
    case "Daily":
      return 1;
    case "Weekly":
      return 7;
    case "Monthly":
      return 30;
    case "Quarterly":
      return 90;
    case "Yearly":
      return 365;
    default:
      return 30;
  }
};

const createInstanceFromRepeatingFunc = async (ctx, lastInstance, info) => {
  const currentAssignedConnect = await lastInstance.currentAssigned.map(
    elem => ({
      id: elem.id
    })
  );

  let deadline = addDays(
    lastInstance.deadline,
    frequencyResult(lastInstance.choreTemplate.frequency)
  );

  let startDate = addDays(lastInstance.deadline, 1);

  return await ctx.db.mutation.createChoreInstance(
    {
      data: {
        name: lastInstance.name,
        currentAssigned: { connect: currentAssignedConnect },
        startDate,
        deadline,
        instanceCost: lastInstance.choreTemplate.choreTemplateCost,
        completionStatus: "INCOMPLETE",
        choreTemplate: { connect: { id: lastInstance.choreTemplate.id } },
        household: { connect: { id: lastInstance.household.id } }
      }
    },
    info
  );
};

const markCompletechoreInstancesToUpdateQuery = async (
  ctx,
  args,
  userId,
  info
) => {
  return await ctx.db.query.choreInstances(
    {
      where: {
        id: args.id,
        completionStatus_in: ["INCOMPLETE", "OVERDUE"],
        OR: [
          { currentAssigned_some: { id: userId } },
          { household: { headsOfHouse_some: { id: userId } } }
        ]
      }
    },
    info
  );
};

const updateChoreInstance = async (ctx, args) => {
  return await ctx.db.mutation.updateChoreInstance(
    {
      data: {
        completionStatus: "COMPLETE"
      },
      where: {
        id: args.id
      }
    },
    `{
          id
          name
          currentAssigned {
              id
              name
          }
          instanceCost
          household {
              id
          }
          choreTemplate {
              id
              frequency
              choreTemplateCost
          }
          deadline
          startDate
          }`
  );
};

module.exports = {
  frequencyResult,
  createInstanceFromRepeatingFunc,
  markCompletechoreInstancesToUpdateQuery,
  updateChoreInstance
};
