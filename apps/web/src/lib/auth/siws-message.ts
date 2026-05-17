const SIWS_DOMAIN = 'arcadery.xyz';

export function buildSiwsMessage(params: {
  publicKey: string;
  nonce: string;
  issuedAt: string;
}): string {
  return [
    `${SIWS_DOMAIN} wants you to sign in with your Solana account:`,
    params.publicKey,
    '',
    'Sign this message to prove ownership of this wallet. No transaction, no fee.',
    '',
    `Nonce: ${params.nonce}`,
    `Issued At: ${params.issuedAt}`,
  ].join('\n');
}

export const NONCE_COOKIE = 'siws_nonce';
export const NONCE_TTL_SECONDS = 5 * 60;
