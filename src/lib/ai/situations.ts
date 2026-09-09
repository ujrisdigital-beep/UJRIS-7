export interface SituationOption {
  id: string;
  label: string;
  prompt: string;
}

export const SITUATION_OPTIONS: SituationOption[] = [
  { id: "unfair_treatment", label: "I've been treated unfairly", prompt: "Tell UJRIS what happened" },
  { id: "discrimination", label: "I've experienced discrimination", prompt: "Tell UJRIS what happened" },
  { id: "dismissal", label: "I've been dismissed", prompt: "Tell UJRIS what happened" },
  { id: "grievance", label: "I have a grievance to raise", prompt: "Tell UJRIS what happened" },
  { id: "dispute", label: "I have a dispute", prompt: "Tell UJRIS what happened" },
  { id: "allegation_received", label: "I've received an allegation or complaint", prompt: "Tell UJRIS what happened" },
  { id: "hearing", label: "I have a hearing coming up", prompt: "Tell UJRIS what happened" },
  { id: "unsure", label: "I don't know where to start", prompt: "Tell UJRIS what happened" },
];

export const SITUATION_LABELS: Record<string, string> = SITUATION_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.id]: o.label }),
  {}
);
