/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type {
  BaseContract,
  BigNumberish,
  BytesLike,
  FunctionFragment,
  Result,
  Interface,
  EventFragment,
  AddressLike,
  ContractRunner,
  ContractMethod,
  Listener,
} from "ethers";
import type {
  TypedContractEvent,
  TypedDeferredTopicFilter,
  TypedEventLog,
  TypedLogDescription,
  TypedListener,
  TypedContractMethod,
} from "./common";

export declare namespace RewardsV2Interface {
  export type RewardClaimStruct = {
    rewardEpochId: BigNumberish;
    beneficiary: BytesLike;
    amount: BigNumberish;
    claimType: BigNumberish;
  };

  export type RewardClaimStructOutput = [
    rewardEpochId: bigint,
    beneficiary: string,
    amount: bigint,
    claimType: bigint
  ] & {
    rewardEpochId: bigint;
    beneficiary: string;
    amount: bigint;
    claimType: bigint;
  };

  export type RewardClaimWithProofStruct = {
    merkleProof: BytesLike[];
    body: RewardsV2Interface.RewardClaimStruct;
  };

  export type RewardClaimWithProofStructOutput = [
    merkleProof: string[],
    body: RewardsV2Interface.RewardClaimStructOutput
  ] & {
    merkleProof: string[];
    body: RewardsV2Interface.RewardClaimStructOutput;
  };
}

export interface ICollateralPoolInterface extends Interface {
  getFunction(
    nameOrSignature:
      | "agentVault"
      | "assetManager"
      | "claimAirdropDistribution"
      | "claimDelegationRewards"
      | "debtFreeTokensOf"
      | "debtLockedTokensOf"
      | "delegate"
      | "depositNat"
      | "destroy"
      | "enter"
      | "exit"
      | "exitCollateralRatioBIPS"
      | "exitTo"
      | "fAssetFeeDebtOf"
      | "fAssetFeeDeposited"
      | "fAssetFeesOf"
      | "fAssetRequiredForSelfCloseExit"
      | "optOutOfAirdrop"
      | "payFAssetFeeDebt"
      | "payout"
      | "poolToken"
      | "selfCloseExit"
      | "selfCloseExitTo"
      | "setExitCollateralRatioBIPS"
      | "setPoolToken"
      | "totalCollateral"
      | "totalFAssetFeeDebt"
      | "totalFAssetFees"
      | "undelegateAll"
      | "upgradeWNatContract"
      | "wNat"
      | "withdrawFees"
      | "withdrawFeesTo"
  ): FunctionFragment;

  getEvent(
    nameOrSignatureOrTopic:
      | "CPClaimedReward"
      | "CPEntered"
      | "CPExited"
      | "CPFeeDebtChanged"
      | "CPFeeDebtPaid"
      | "CPFeesWithdrawn"
      | "CPPaidOut"
      | "CPSelfCloseExited"
  ): EventFragment;

  encodeFunctionData(
    functionFragment: "agentVault",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "assetManager",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "claimAirdropDistribution",
    values: [AddressLike, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "claimDelegationRewards",
    values: [
      AddressLike,
      BigNumberish,
      RewardsV2Interface.RewardClaimWithProofStruct[]
    ]
  ): string;
  encodeFunctionData(
    functionFragment: "debtFreeTokensOf",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "debtLockedTokensOf",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "delegate",
    values: [AddressLike, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "depositNat",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "destroy",
    values: [AddressLike]
  ): string;
  encodeFunctionData(functionFragment: "enter", values?: undefined): string;
  encodeFunctionData(functionFragment: "exit", values: [BigNumberish]): string;
  encodeFunctionData(
    functionFragment: "exitCollateralRatioBIPS",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "exitTo",
    values: [BigNumberish, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "fAssetFeeDebtOf",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "fAssetFeeDeposited",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "fAssetFeesOf",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "fAssetRequiredForSelfCloseExit",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "optOutOfAirdrop",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "payFAssetFeeDebt",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "payout",
    values: [AddressLike, BigNumberish, BigNumberish]
  ): string;
  encodeFunctionData(functionFragment: "poolToken", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "selfCloseExit",
    values: [BigNumberish, boolean, string, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "selfCloseExitTo",
    values: [BigNumberish, boolean, AddressLike, string, AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "setExitCollateralRatioBIPS",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "setPoolToken",
    values: [AddressLike]
  ): string;
  encodeFunctionData(
    functionFragment: "totalCollateral",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "totalFAssetFeeDebt",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "totalFAssetFees",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "undelegateAll",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "upgradeWNatContract",
    values: [AddressLike]
  ): string;
  encodeFunctionData(functionFragment: "wNat", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "withdrawFees",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "withdrawFeesTo",
    values: [BigNumberish, AddressLike]
  ): string;

  decodeFunctionResult(functionFragment: "agentVault", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "assetManager",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "claimAirdropDistribution",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "claimDelegationRewards",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "debtFreeTokensOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "debtLockedTokensOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "delegate", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "depositNat", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "destroy", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "enter", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "exit", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "exitCollateralRatioBIPS",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "exitTo", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "fAssetFeeDebtOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "fAssetFeeDeposited",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "fAssetFeesOf",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "fAssetRequiredForSelfCloseExit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "optOutOfAirdrop",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "payFAssetFeeDebt",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "payout", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "poolToken", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "selfCloseExit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "selfCloseExitTo",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setExitCollateralRatioBIPS",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "setPoolToken",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "totalCollateral",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "totalFAssetFeeDebt",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "totalFAssetFees",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "undelegateAll",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "upgradeWNatContract",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "wNat", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "withdrawFees",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "withdrawFeesTo",
    data: BytesLike
  ): Result;
}

export namespace CPClaimedRewardEvent {
  export type InputTuple = [
    amountNatWei: BigNumberish,
    rewardType: BigNumberish
  ];
  export type OutputTuple = [amountNatWei: bigint, rewardType: bigint];
  export interface OutputObject {
    amountNatWei: bigint;
    rewardType: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace CPEnteredEvent {
  export type InputTuple = [
    tokenHolder: AddressLike,
    amountNatWei: BigNumberish,
    receivedTokensWei: BigNumberish,
    timelockExpiresAt: BigNumberish
  ];
  export type OutputTuple = [
    tokenHolder: string,
    amountNatWei: bigint,
    receivedTokensWei: bigint,
    timelockExpiresAt: bigint
  ];
  export interface OutputObject {
    tokenHolder: string;
    amountNatWei: bigint;
    receivedTokensWei: bigint;
    timelockExpiresAt: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace CPExitedEvent {
  export type InputTuple = [
    tokenHolder: AddressLike,
    burnedTokensWei: BigNumberish,
    receivedNatWei: BigNumberish
  ];
  export type OutputTuple = [
    tokenHolder: string,
    burnedTokensWei: bigint,
    receivedNatWei: bigint
  ];
  export interface OutputObject {
    tokenHolder: string;
    burnedTokensWei: bigint;
    receivedNatWei: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace CPFeeDebtChangedEvent {
  export type InputTuple = [
    tokenHolder: AddressLike,
    newFeeDebtUBA: BigNumberish
  ];
  export type OutputTuple = [tokenHolder: string, newFeeDebtUBA: bigint];
  export interface OutputObject {
    tokenHolder: string;
    newFeeDebtUBA: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace CPFeeDebtPaidEvent {
  export type InputTuple = [
    tokenHolder: AddressLike,
    paidFeesUBA: BigNumberish
  ];
  export type OutputTuple = [tokenHolder: string, paidFeesUBA: bigint];
  export interface OutputObject {
    tokenHolder: string;
    paidFeesUBA: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace CPFeesWithdrawnEvent {
  export type InputTuple = [
    tokenHolder: AddressLike,
    withdrawnFeesUBA: BigNumberish
  ];
  export type OutputTuple = [tokenHolder: string, withdrawnFeesUBA: bigint];
  export interface OutputObject {
    tokenHolder: string;
    withdrawnFeesUBA: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace CPPaidOutEvent {
  export type InputTuple = [
    recipient: AddressLike,
    paidNatWei: BigNumberish,
    burnedTokensWei: BigNumberish
  ];
  export type OutputTuple = [
    recipient: string,
    paidNatWei: bigint,
    burnedTokensWei: bigint
  ];
  export interface OutputObject {
    recipient: string;
    paidNatWei: bigint;
    burnedTokensWei: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export namespace CPSelfCloseExitedEvent {
  export type InputTuple = [
    tokenHolder: AddressLike,
    burnedTokensWei: BigNumberish,
    receivedNatWei: BigNumberish,
    closedFAssetsUBA: BigNumberish
  ];
  export type OutputTuple = [
    tokenHolder: string,
    burnedTokensWei: bigint,
    receivedNatWei: bigint,
    closedFAssetsUBA: bigint
  ];
  export interface OutputObject {
    tokenHolder: string;
    burnedTokensWei: bigint;
    receivedNatWei: bigint;
    closedFAssetsUBA: bigint;
  }
  export type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
  export type Filter = TypedDeferredTopicFilter<Event>;
  export type Log = TypedEventLog<Event>;
  export type LogDescription = TypedLogDescription<Event>;
}

export interface ICollateralPool extends BaseContract {
  connect(runner?: ContractRunner | null): ICollateralPool;
  waitForDeployment(): Promise<this>;

  interface: ICollateralPoolInterface;

  queryFilter<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;
  queryFilter<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TypedEventLog<TCEvent>>>;

  on<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  on<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  once<TCEvent extends TypedContractEvent>(
    event: TCEvent,
    listener: TypedListener<TCEvent>
  ): Promise<this>;
  once<TCEvent extends TypedContractEvent>(
    filter: TypedDeferredTopicFilter<TCEvent>,
    listener: TypedListener<TCEvent>
  ): Promise<this>;

  listeners<TCEvent extends TypedContractEvent>(
    event: TCEvent
  ): Promise<Array<TypedListener<TCEvent>>>;
  listeners(eventName?: string): Promise<Array<Listener>>;
  removeAllListeners<TCEvent extends TypedContractEvent>(
    event?: TCEvent
  ): Promise<this>;

  agentVault: TypedContractMethod<[], [string], "view">;

  assetManager: TypedContractMethod<[], [string], "view">;

  claimAirdropDistribution: TypedContractMethod<
    [_distribution: AddressLike, _month: BigNumberish],
    [bigint],
    "nonpayable"
  >;

  claimDelegationRewards: TypedContractMethod<
    [
      _rewardManager: AddressLike,
      _lastRewardEpoch: BigNumberish,
      _proofs: RewardsV2Interface.RewardClaimWithProofStruct[]
    ],
    [bigint],
    "nonpayable"
  >;

  debtFreeTokensOf: TypedContractMethod<
    [_account: AddressLike],
    [bigint],
    "view"
  >;

  debtLockedTokensOf: TypedContractMethod<
    [_account: AddressLike],
    [bigint],
    "view"
  >;

  delegate: TypedContractMethod<
    [_to: AddressLike, _bips: BigNumberish],
    [void],
    "nonpayable"
  >;

  depositNat: TypedContractMethod<[], [void], "payable">;

  destroy: TypedContractMethod<[_recipient: AddressLike], [void], "nonpayable">;

  enter: TypedContractMethod<
    [],
    [
      [bigint, bigint] & { _receivedTokens: bigint; _timelockExpiresAt: bigint }
    ],
    "payable"
  >;

  exit: TypedContractMethod<
    [_tokenShare: BigNumberish],
    [bigint],
    "nonpayable"
  >;

  exitCollateralRatioBIPS: TypedContractMethod<[], [bigint], "view">;

  exitTo: TypedContractMethod<
    [_tokenShare: BigNumberish, _recipient: AddressLike],
    [bigint],
    "nonpayable"
  >;

  fAssetFeeDebtOf: TypedContractMethod<
    [_account: AddressLike],
    [bigint],
    "view"
  >;

  fAssetFeeDeposited: TypedContractMethod<
    [_amount: BigNumberish],
    [void],
    "nonpayable"
  >;

  fAssetFeesOf: TypedContractMethod<[_account: AddressLike], [bigint], "view">;

  fAssetRequiredForSelfCloseExit: TypedContractMethod<
    [_tokenAmountWei: BigNumberish],
    [bigint],
    "view"
  >;

  optOutOfAirdrop: TypedContractMethod<
    [_distribution: AddressLike],
    [void],
    "nonpayable"
  >;

  payFAssetFeeDebt: TypedContractMethod<
    [_fassets: BigNumberish],
    [void],
    "nonpayable"
  >;

  payout: TypedContractMethod<
    [
      _receiver: AddressLike,
      _amountWei: BigNumberish,
      _agentResponsibilityWei: BigNumberish
    ],
    [void],
    "nonpayable"
  >;

  poolToken: TypedContractMethod<[], [string], "view">;

  selfCloseExit: TypedContractMethod<
    [
      _tokenShare: BigNumberish,
      _redeemToCollateral: boolean,
      _redeemerUnderlyingAddress: string,
      _executor: AddressLike
    ],
    [void],
    "payable"
  >;

  selfCloseExitTo: TypedContractMethod<
    [
      _tokenShare: BigNumberish,
      _redeemToCollateral: boolean,
      _recipient: AddressLike,
      _redeemerUnderlyingAddress: string,
      _executor: AddressLike
    ],
    [void],
    "payable"
  >;

  setExitCollateralRatioBIPS: TypedContractMethod<
    [_value: BigNumberish],
    [void],
    "nonpayable"
  >;

  setPoolToken: TypedContractMethod<
    [_poolToken: AddressLike],
    [void],
    "nonpayable"
  >;

  totalCollateral: TypedContractMethod<[], [bigint], "view">;

  totalFAssetFeeDebt: TypedContractMethod<[], [bigint], "view">;

  totalFAssetFees: TypedContractMethod<[], [bigint], "view">;

  undelegateAll: TypedContractMethod<[], [void], "nonpayable">;

  upgradeWNatContract: TypedContractMethod<
    [newWNat: AddressLike],
    [void],
    "nonpayable"
  >;

  wNat: TypedContractMethod<[], [string], "view">;

  withdrawFees: TypedContractMethod<
    [_amount: BigNumberish],
    [void],
    "nonpayable"
  >;

  withdrawFeesTo: TypedContractMethod<
    [_amount: BigNumberish, _recipient: AddressLike],
    [void],
    "nonpayable"
  >;

  getFunction<T extends ContractMethod = ContractMethod>(
    key: string | FunctionFragment
  ): T;

  getFunction(
    nameOrSignature: "agentVault"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "assetManager"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "claimAirdropDistribution"
  ): TypedContractMethod<
    [_distribution: AddressLike, _month: BigNumberish],
    [bigint],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "claimDelegationRewards"
  ): TypedContractMethod<
    [
      _rewardManager: AddressLike,
      _lastRewardEpoch: BigNumberish,
      _proofs: RewardsV2Interface.RewardClaimWithProofStruct[]
    ],
    [bigint],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "debtFreeTokensOf"
  ): TypedContractMethod<[_account: AddressLike], [bigint], "view">;
  getFunction(
    nameOrSignature: "debtLockedTokensOf"
  ): TypedContractMethod<[_account: AddressLike], [bigint], "view">;
  getFunction(
    nameOrSignature: "delegate"
  ): TypedContractMethod<
    [_to: AddressLike, _bips: BigNumberish],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "depositNat"
  ): TypedContractMethod<[], [void], "payable">;
  getFunction(
    nameOrSignature: "destroy"
  ): TypedContractMethod<[_recipient: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "enter"
  ): TypedContractMethod<
    [],
    [
      [bigint, bigint] & { _receivedTokens: bigint; _timelockExpiresAt: bigint }
    ],
    "payable"
  >;
  getFunction(
    nameOrSignature: "exit"
  ): TypedContractMethod<[_tokenShare: BigNumberish], [bigint], "nonpayable">;
  getFunction(
    nameOrSignature: "exitCollateralRatioBIPS"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "exitTo"
  ): TypedContractMethod<
    [_tokenShare: BigNumberish, _recipient: AddressLike],
    [bigint],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "fAssetFeeDebtOf"
  ): TypedContractMethod<[_account: AddressLike], [bigint], "view">;
  getFunction(
    nameOrSignature: "fAssetFeeDeposited"
  ): TypedContractMethod<[_amount: BigNumberish], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "fAssetFeesOf"
  ): TypedContractMethod<[_account: AddressLike], [bigint], "view">;
  getFunction(
    nameOrSignature: "fAssetRequiredForSelfCloseExit"
  ): TypedContractMethod<[_tokenAmountWei: BigNumberish], [bigint], "view">;
  getFunction(
    nameOrSignature: "optOutOfAirdrop"
  ): TypedContractMethod<[_distribution: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "payFAssetFeeDebt"
  ): TypedContractMethod<[_fassets: BigNumberish], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "payout"
  ): TypedContractMethod<
    [
      _receiver: AddressLike,
      _amountWei: BigNumberish,
      _agentResponsibilityWei: BigNumberish
    ],
    [void],
    "nonpayable"
  >;
  getFunction(
    nameOrSignature: "poolToken"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "selfCloseExit"
  ): TypedContractMethod<
    [
      _tokenShare: BigNumberish,
      _redeemToCollateral: boolean,
      _redeemerUnderlyingAddress: string,
      _executor: AddressLike
    ],
    [void],
    "payable"
  >;
  getFunction(
    nameOrSignature: "selfCloseExitTo"
  ): TypedContractMethod<
    [
      _tokenShare: BigNumberish,
      _redeemToCollateral: boolean,
      _recipient: AddressLike,
      _redeemerUnderlyingAddress: string,
      _executor: AddressLike
    ],
    [void],
    "payable"
  >;
  getFunction(
    nameOrSignature: "setExitCollateralRatioBIPS"
  ): TypedContractMethod<[_value: BigNumberish], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "setPoolToken"
  ): TypedContractMethod<[_poolToken: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "totalCollateral"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "totalFAssetFeeDebt"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "totalFAssetFees"
  ): TypedContractMethod<[], [bigint], "view">;
  getFunction(
    nameOrSignature: "undelegateAll"
  ): TypedContractMethod<[], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "upgradeWNatContract"
  ): TypedContractMethod<[newWNat: AddressLike], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "wNat"
  ): TypedContractMethod<[], [string], "view">;
  getFunction(
    nameOrSignature: "withdrawFees"
  ): TypedContractMethod<[_amount: BigNumberish], [void], "nonpayable">;
  getFunction(
    nameOrSignature: "withdrawFeesTo"
  ): TypedContractMethod<
    [_amount: BigNumberish, _recipient: AddressLike],
    [void],
    "nonpayable"
  >;

  getEvent(
    key: "CPClaimedReward"
  ): TypedContractEvent<
    CPClaimedRewardEvent.InputTuple,
    CPClaimedRewardEvent.OutputTuple,
    CPClaimedRewardEvent.OutputObject
  >;
  getEvent(
    key: "CPEntered"
  ): TypedContractEvent<
    CPEnteredEvent.InputTuple,
    CPEnteredEvent.OutputTuple,
    CPEnteredEvent.OutputObject
  >;
  getEvent(
    key: "CPExited"
  ): TypedContractEvent<
    CPExitedEvent.InputTuple,
    CPExitedEvent.OutputTuple,
    CPExitedEvent.OutputObject
  >;
  getEvent(
    key: "CPFeeDebtChanged"
  ): TypedContractEvent<
    CPFeeDebtChangedEvent.InputTuple,
    CPFeeDebtChangedEvent.OutputTuple,
    CPFeeDebtChangedEvent.OutputObject
  >;
  getEvent(
    key: "CPFeeDebtPaid"
  ): TypedContractEvent<
    CPFeeDebtPaidEvent.InputTuple,
    CPFeeDebtPaidEvent.OutputTuple,
    CPFeeDebtPaidEvent.OutputObject
  >;
  getEvent(
    key: "CPFeesWithdrawn"
  ): TypedContractEvent<
    CPFeesWithdrawnEvent.InputTuple,
    CPFeesWithdrawnEvent.OutputTuple,
    CPFeesWithdrawnEvent.OutputObject
  >;
  getEvent(
    key: "CPPaidOut"
  ): TypedContractEvent<
    CPPaidOutEvent.InputTuple,
    CPPaidOutEvent.OutputTuple,
    CPPaidOutEvent.OutputObject
  >;
  getEvent(
    key: "CPSelfCloseExited"
  ): TypedContractEvent<
    CPSelfCloseExitedEvent.InputTuple,
    CPSelfCloseExitedEvent.OutputTuple,
    CPSelfCloseExitedEvent.OutputObject
  >;

  filters: {
    "CPClaimedReward(uint256,uint8)": TypedContractEvent<
      CPClaimedRewardEvent.InputTuple,
      CPClaimedRewardEvent.OutputTuple,
      CPClaimedRewardEvent.OutputObject
    >;
    CPClaimedReward: TypedContractEvent<
      CPClaimedRewardEvent.InputTuple,
      CPClaimedRewardEvent.OutputTuple,
      CPClaimedRewardEvent.OutputObject
    >;

    "CPEntered(address,uint256,uint256,uint256)": TypedContractEvent<
      CPEnteredEvent.InputTuple,
      CPEnteredEvent.OutputTuple,
      CPEnteredEvent.OutputObject
    >;
    CPEntered: TypedContractEvent<
      CPEnteredEvent.InputTuple,
      CPEnteredEvent.OutputTuple,
      CPEnteredEvent.OutputObject
    >;

    "CPExited(address,uint256,uint256)": TypedContractEvent<
      CPExitedEvent.InputTuple,
      CPExitedEvent.OutputTuple,
      CPExitedEvent.OutputObject
    >;
    CPExited: TypedContractEvent<
      CPExitedEvent.InputTuple,
      CPExitedEvent.OutputTuple,
      CPExitedEvent.OutputObject
    >;

    "CPFeeDebtChanged(address,int256)": TypedContractEvent<
      CPFeeDebtChangedEvent.InputTuple,
      CPFeeDebtChangedEvent.OutputTuple,
      CPFeeDebtChangedEvent.OutputObject
    >;
    CPFeeDebtChanged: TypedContractEvent<
      CPFeeDebtChangedEvent.InputTuple,
      CPFeeDebtChangedEvent.OutputTuple,
      CPFeeDebtChangedEvent.OutputObject
    >;

    "CPFeeDebtPaid(address,uint256)": TypedContractEvent<
      CPFeeDebtPaidEvent.InputTuple,
      CPFeeDebtPaidEvent.OutputTuple,
      CPFeeDebtPaidEvent.OutputObject
    >;
    CPFeeDebtPaid: TypedContractEvent<
      CPFeeDebtPaidEvent.InputTuple,
      CPFeeDebtPaidEvent.OutputTuple,
      CPFeeDebtPaidEvent.OutputObject
    >;

    "CPFeesWithdrawn(address,uint256)": TypedContractEvent<
      CPFeesWithdrawnEvent.InputTuple,
      CPFeesWithdrawnEvent.OutputTuple,
      CPFeesWithdrawnEvent.OutputObject
    >;
    CPFeesWithdrawn: TypedContractEvent<
      CPFeesWithdrawnEvent.InputTuple,
      CPFeesWithdrawnEvent.OutputTuple,
      CPFeesWithdrawnEvent.OutputObject
    >;

    "CPPaidOut(address,uint256,uint256)": TypedContractEvent<
      CPPaidOutEvent.InputTuple,
      CPPaidOutEvent.OutputTuple,
      CPPaidOutEvent.OutputObject
    >;
    CPPaidOut: TypedContractEvent<
      CPPaidOutEvent.InputTuple,
      CPPaidOutEvent.OutputTuple,
      CPPaidOutEvent.OutputObject
    >;

    "CPSelfCloseExited(address,uint256,uint256,uint256)": TypedContractEvent<
      CPSelfCloseExitedEvent.InputTuple,
      CPSelfCloseExitedEvent.OutputTuple,
      CPSelfCloseExitedEvent.OutputObject
    >;
    CPSelfCloseExited: TypedContractEvent<
      CPSelfCloseExitedEvent.InputTuple,
      CPSelfCloseExitedEvent.OutputTuple,
      CPSelfCloseExitedEvent.OutputObject
    >;
  };
}
