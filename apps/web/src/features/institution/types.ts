export interface Institution {
  name: string;
  shortName: string | null;
  affiliation: string | null;
  canton: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  about: string | null;
  contactInfo: string | null;
  privacyPolicy: string | null;
  documentFooter: string | null;
  presidentName: string | null;
  secretaryName: string | null;
  publicClubs: boolean;
  publicAthletes: boolean;
  publicNews: boolean;
  publicResolutions: boolean;
  hasLogo: boolean;
}

/** Datos institucionales publicados (sin sesión). */
export interface PublicInstitution {
  name: string;
  shortName: string | null;
  affiliation: string | null;
  canton: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  about: string | null;
  contactInfo: string | null;
  privacyPolicy: string | null;
  presidentName: string | null;
  secretaryName: string | null;
  hasLogo: boolean;
  publication: {
    clubs: boolean;
    athletes: boolean;
    news: boolean;
    resolutions: boolean;
  };
}
