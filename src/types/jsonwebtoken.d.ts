declare module "jsonwebtoken" {
  export interface JwtPayload {
    [key: string]: unknown
    sub?: string
    iat?: number
    exp?: number
  }

  export interface SignOptions {
    expiresIn?: string | number
  }

  export type Secret = string | Buffer

  export function sign(payload: string | object | Buffer, secretOrPrivateKey: Secret, options?: SignOptions): string
  export function verify(token: string, secretOrPublicKey: Secret): string | JwtPayload

  const jwt: {
    sign: typeof sign
    verify: typeof verify
  }

  export default jwt
}
