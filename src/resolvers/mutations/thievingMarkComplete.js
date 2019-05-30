const { endOfToday, addDays, startOfToday } = require("date-fns");
const { frequencyResult } = require("./markComplete");

exports.createNewDebts = async (instanceTopUpdate, ctx, args, userId) => {
  let { currentAssigned, instanceCost, household } = instanceTopUpdate;
  let totalDebts = currentAssigned.length;
  let debtAmount = instanceCost / totalDebts;

  const asyncDebtFunction = async assignedUser => {
    return await ctx.db.mutation.createDebt({
      data: {
        from: { connect: { id: args.id } },
        settled: "UNPAID",
        debtor: { connect: { id: assignedUser.id } },
        creditor: { connect: { id: userId } },
        amount: debtAmount,
        amountPaid: 0,
        household: { connect: { id: household.id } }
      }
    });
  };

  return await Promise.all(
    currentAssigned.map(async assignedUser => {
      return await asyncDebtFunction(assignedUser);
    })
  );
};

exports.choreInstancesToUpdateQuery = async (ctx, args, userId) => {
  return await ctx.db.query.choreInstances(
    {
      where: {
        id: args.id,
        completionStatus_in: ["OVERDUE"],
        household: { houseMembers_some: { id: userId } },
        currentAssigned_none: { id: userId }
      }
    },
    `{ name
          currentAssigned { id name }
          startDate
          deadline
          instanceCost
          completionStatus
          household { id name houseMembers { id name } }
         }`
  );
};

exports.updatedInstanceFunc = async (ctx, instanceId, userId, info) => {
  return await ctx.db.mutation.updateChoreInstance(
    {
      where: {
        id: instanceId
      },
      data: {
        completionStatus: "COMPLETE"
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

exports.overdueCreateInstanceFromRepeatingFunc = async (
  ctx,
  lastInstance,
  info
) => {
  const currentAssignedConnect = await lastInstance.currentAssigned.map(
    elem => ({
      id: elem.id
    })
  );

  let deadline = addDays(
    endOfToday(),
    frequencyResult(lastInstance.choreTemplate.frequency)
  );

  return await ctx.db.mutation.createChoreInstance(
    {
      data: {
        name: lastInstance.name,
        currentAssigned: { connect: currentAssignedConnect },
        startDate: startOfToday(),
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
