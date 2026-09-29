import { createHash } from "node:crypto";

export const PLAN_LABEL = { student: "Student", ordinar: "Ordinær" };
export const LEVELS = ["Nybegynner", "Videregående"];

// Draft terms. The club edits the final wording in the admin panel (Innstillinger);
// each contract stores a snapshot of the terms that applied when it was signed.
export const DEFAULT_TERMS = `1. Medlemskap
Medlemskapet gir rett til å delta på treningene i Nordic Boxing Center i henhold til gjeldende program. Medlemskapet er personlig og kan ikke overdras.

2. Betaling
Medlemskontingenten betales månedlig på forskudd. Første måned belastes ved innmelding, deretter trekkes beløpet automatisk hver måned via valgt betalingsmåte (Vipps eller kort). Ved manglende betaling kan klubben stanse retten til å trene til utestående beløp er betalt.

3. Bindingstid og oppsigelse
Medlemskap uten binding kan sies opp når som helst med én måneds oppsigelsestid, regnet fra utgangen av inneværende måned.
Medlemskap med 12 måneders binding kan tidligst avsluttes ved utløpet av bindingstiden. Etter bindingstiden løper medlemskapet videre uten binding.
Oppsigelse sendes skriftlig til klubbens e-postadresse.

4. Studentpris
Studentpris forutsetter gyldig studentbevis, som vises ved første trening og ellers på forespørsel. Dersom vilkårene for studentpris ikke lenger er oppfylt, endres prisen til ordinær pris fra neste måned.

5. Angrerett
Avtalen er inngått ved fjernsalg, og du har 14 dagers angrerett etter angrerettloven, regnet fra avtaleinngåelsen. Dersom du har begynt å trene i angrefristen, må du betale en forholdsmessig andel for perioden du har benyttet.

6. Helse og ansvar
Medlemmet trener på eget ansvar og bekrefter å ikke ha kjente helseforhold som gjør boksetrening uforsvarlig. Medlemmet plikter å følge trenernes instruksjoner og klubbens regler.

7. Personopplysninger
Klubben lagrer navn, fødselsdato, kontaktinformasjon, avtale- og betalingshistorikk for å administrere medlemskapet. Opplysningene deles kun med betalingsleverandør (Vipps eller kortleverandør) og slettes når de ikke lenger er nødvendige, med unntak av det som må oppbevares etter bokføringsloven.`;

export const today = () => new Date().toISOString().slice(0, 10);

export function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function ageFrom(birthdate) {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

export const kr = (ore) => `kr ${(ore / 100).toLocaleString("nb-NO", { minimumFractionDigits: 0 })}`;
export const noDate = (iso) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");

export function priceFor(prices, plan, bindingMonths) {
  const p = prices[plan];
  if (!p) throw new Error("Ukjent medlemskap");
  return bindingMonths === 12 ? p.bound : p.free;
}

export function buildContractText({ club, member, plan, level, bindingMonths, priceOre, terms, signedAt }) {
  const lines = [
    "MEDLEMSKONTRAKT",
    "",
    `Klubb: ${club.name}`,
    `Adresse: ${club.address}`,
    club.orgnr ? `Org.nr.: ${club.orgnr}` : null,
    `Kontakt: ${club.email} · ${club.phone}`,
    "",
    `Medlem: ${member.name}`,
    `Fødselsdato: ${noDate(member.birthdate)}`,
    `E-post: ${member.email || "(fylles inn)"}`,
    `Telefon: ${member.phone || "(fylles inn)"}`,
    "",
    `Medlemskap: ${PLAN_LABEL[plan]}`,
    `Nivå: ${level}`,
    `Pris: ${kr(priceOre)} per måned`,
    `Bindingstid: ${bindingMonths === 12 ? "12 måneder" : "Uten binding"}`,
    "",
    "VILKÅR",
    "",
    terms.trim(),
    "",
    "SIGNATUR",
    signedAt
      ? `Signert elektronisk av ${member.name} etter identifisering med BankID, ${new Date(signedAt).toLocaleString("nb-NO", { timeZone: "Europe/Oslo" })}.`
      : "Signeres elektronisk etter identifisering med BankID.",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
