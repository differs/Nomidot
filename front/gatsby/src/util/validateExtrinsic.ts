// // Copyright 2018-2020 @paritytech/Nomidot authors & contributors
// // This software may be modified and distributed under the terms
// // of the Apache-2.0 license. See the LICENSE file for details.

import { DeriveBalancesAll, DeriveFees } from '@polkadot/api-derive/types';
import { SubmittableExtrinsic } from '@polkadot/api/submittable/types';
import { AccountInfo } from '@polkadot/types/interfaces';
import { compactToU8a } from '@polkadot/util';
import BN from 'bn.js';

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const LENGTH_PUBLICKEY = 32 + 1; // publicKey + prefix
const LENGTH_SIGNATURE = 64;
const LENGTH_ERA = 1;
const SIGNATURE_SIZE = LENGTH_PUBLICKEY + LENGTH_SIGNATURE + LENGTH_ERA;

type Error = string;
type Errors = Error[];

/**
 * Make sure derived validations (fees, minimal amount) are correct.
 * @see https://github.com/polkadot-js/apps/tree/master/packages/react-signer
 */
export function validateFees(
  accountNonce: AccountInfo,
  amount = new BN(0),
  currentBalance: DeriveBalancesAll,
  extrinsic: SubmittableExtrinsic<'promise' | 'rxjs'>,
  fees: DeriveFees
): [Errors, BN, BN] {
  const txLength =
    SIGNATURE_SIZE +
    compactToU8a(accountNonce.nonce).length +
    extrinsic.encodedLength;
  const allFees = fees.transactionBaseFee.add(
    fees.transactionByteFee.muln(txLength)
  );
  const isCreation = false;

  const allTotal = amount
    .add(allFees)
    .add(isCreation ? fees.creationFee : new BN(0));

  const hasAvailable =
    extrinsic.method.methodName === 'transfer'
      ? currentBalance.freeBalance.gte(allTotal)
      : true;

  // Other activities that may lock up the funds are permitted
  const isRemovable =
    extrinsic.method.methodName === 'transfer'
      ? currentBalance.votingBalance.sub(allTotal).lte(fees.existentialDeposit)
      : false;

  const overLimit = txLength >= MAX_SIZE_BYTES;
  const errors = [] as Errors;

  if (!hasAvailable) {
    errors.push(
      'The selected account does not have the required balance available for this transaction.'
    );
  }

  if (isRemovable) {
    errors.push(
      'Making this call will drop your balance below the existential balance.'
    );
  }

  if (overLimit) {
    errors.push(
      `This transaction will be rejected by the node as it is greater than the maximum size of ${MAX_SIZE_MB}MB.`
    );
  }

  return [errors, allTotal, allFees];
}
