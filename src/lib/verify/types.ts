export type RawCandidateFix = {
  file: string;
  lineStart: number;
  lineEnd: number;
  replacement: string;
  explanation: string;
};

export type CandidateFix = RawCandidateFix & {
  id: string;
};

export type PendingVerification = {
  branch: string;
  owner: string;
  repo: string;
  installationId: number;
  prNumber: number;
  file: string;
  lineStart: number;
  lineEnd: number;
  replacement: string;
  explanation: string;
  headShaAtDispatch: string;
  createdAt: number;
};
