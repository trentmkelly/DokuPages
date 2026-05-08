declare module "unix-crypt-td-js" {
  export default function unixCrypt(password: string | number[], salt: string | number[]): string;
}
