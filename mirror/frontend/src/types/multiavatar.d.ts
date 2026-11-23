declare module '@multiavatar/multiavatar' {
  interface MultiavatarVersion {
    part: string;
    theme: 'A' | 'B' | 'C';
  }

  function multiavatar(seed: string, sansEnvironment?: boolean, version?: MultiavatarVersion): string;
  export default multiavatar;
}
