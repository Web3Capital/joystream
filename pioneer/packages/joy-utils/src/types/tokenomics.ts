export type TokenomicsData = {
  totalIssuance: number;
  currentlyStakedTokens: number;
  totalWeeklySpending: number;
  totalNumberOfActors: number;
  validators: {
    number: number;
    nominators: {
      number: number;
    };
    rewardsPerWeek: number;
    rewardsShare: number;
    totalStake: number;
    stakeShare: number;
  };
  council: {
    number: number;
    rewardsPerWeek: number;
    rewardsShare: number;
    totalStake: number;
    stakeShare: number;
  };
  storageProviders: {
    number: number;
    totalStake: number;
    stakeShare: number;
    rewardsPerWeek: number;
    rewardsShare: number;
    lead: {
      number: number;
      totalStake: number;
      stakeShare: number;
      rewardsPerWeek: number;
      rewardsShare: number;
    };
  };
  contentCurators: {
    number: number;
    contentCuratorLead: number;
    rewardsPerWeek: number;
    rewardsShare: number;
    totalStake: number;
    stakeShare: number;
  };
}

export type StatusServerData = {
  dollarPool: {
    size: number;
    replenishAmount: number;
  };
  price: string;
};
