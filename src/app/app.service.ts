import { Injectable } from '@angular/core';
import {
  Address,
  Contract,
  nativeToScVal,
  Networks,
  scValToNative,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { Buffer } from 'buffer';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  rpc = new SorobanRpc.Server('https://soroban-rpc.creit.tech');
  contract = new Contract('CC5TSJ3E26YUYGYQKOBNJQLPX4XMUHUY7Q26JX53CJ2YUIZB5HVXXRV6');

  async fetchLatestBlock(): Promise<{ block: Block; state: State }> {
    const instanceData: SorobanRpc.Api.LedgerEntryResult = await this.rpc.getContractData(
      this.contract,
      xdr.ScVal.scvLedgerKeyContractInstance(),
      SorobanRpc.Durability.Persistent
    );

    const state: State = scValToNative((instanceData.val.value() as any).val().value().storage()[0].val());

    const keyEntry = await this.rpc.getContractData(
      this.contract,
      xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('Block'), nativeToScVal(state.current, { type: 'u64' })]),
      SorobanRpc.Durability.Persistent
    );

    const block: Block = scValToNative(keyEntry.val.contractData().val());

    return { state, block };
  }

  async generateXDR(params: { hash: Buffer; message: string; nonce: number; miner: string }): Promise<string> {
    const account: Address = new Address(params.miner);
    const source = await this.rpc.getAccount(params.miner);

    const transaction: Transaction = new TransactionBuilder(source, {
      networkPassphrase: Networks.PUBLIC,
      fee: '10000000',
    })
      .setTimeout(0)
      .addOperation(
        this.contract.call(
          'mine',
          xdr.ScVal.scvBytes(params.hash),
          xdr.ScVal.scvString(params.message),
          nativeToScVal(params.nonce, { type: 'u64' }),
          account.toScVal()
        )
      )
      .build();

    const sim: SorobanRpc.Api.SimulateTransactionResponse = await this.rpc.simulateTransaction(transaction);

    if (SorobanRpc.Api.isSimulationError(sim)) {
      throw new Error(sim.error);
    }

    return SorobanRpc.assembleTransaction(transaction, sim).build().toXDR();
  }
}

export interface Block {
  index: bigint;
  message: string;
  prev_hash: Buffer;
  nonce: bigint;
  miner: string;
  hash: Buffer;
  timestamp: bigint;
}

export interface State {
  fcm: string;
  current: bigint;
  difficulty: number;
  is_nuked: boolean;
  finder: string;
}
