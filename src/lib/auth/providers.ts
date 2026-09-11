export type AdultProvider = {
  providerId: "google";
  idp: "google";
  label: string;
};

export const ADULT_PROVIDERS: readonly AdultProvider[] = [
  { providerId: "google", idp: "google", label: "Google" },
];
