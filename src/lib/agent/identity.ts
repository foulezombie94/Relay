// The backend supplies the model identifier; no provider self-identification is trusted.
export function configuredAgentProvider(): "openai" | "groq" {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "openai";
  if (provider !== "openai" && provider !== "groq")
    throw new Error("Fournisseur AI_PROVIDER invalide.");
  return provider;
}
export function configuredAgentModel() {
  const groq = configuredAgentProvider() === "groq";
  const model = groq
    ? process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b"
    : process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(model))
    throw new Error(`Identifiant ${groq ? "GROQ_MODEL" : "OPENAI_MODEL"} invalide.`);
  return model;
}
export function directIdentityAnswer(question: string, model: string): string | null {
  const q = question
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[?!.,]+$/, "")
    .trim();
  // Whole requests only: compound requests and quoted/external instructions
  // stay in the normal agent flow. This is not a CRM intent keyword router.
  if (
    /^(?:tu utilises quel modele(?: exactement)?|quel (?:est (?:ton|votre) )?modele(?: exactement)?|quel modele (?:utilises-tu|utilisez-vous)|what model (?:do you use|are you using))$/.test(
      q,
    )
  )
    return (
      "Je suis Ask Zyliad, l’assistant IA officiel du CRM Zyliad, propulsé par OpenAI. Le modèle configuré pour cette conversation est " +
      model +
      "."
    );
  if (
    /^(?:tu utilises quelle ia|vous utilisez quelle ia|quelle ia (?:utilises-tu|utilisez-vous)|qui fournit (?:ton|votre) ia|are you powered by openai)$/.test(
      q,
    )
  )
    return "Je suis Ask Zyliad, l’assistant IA officiel du CRM Zyliad, propulsé par les modèles d’OpenAI. Zyliad fournit l’application et les outils CRM ; Zyliad n’a pas entraîné son propre modèle fondamental.";
  if (
    /^(?:tu es qui|qui es-tu|qui etes-vous|presente-toi|presentez-vous|c['’]est quoi ask zyliad|c['’]est quoi ask relay|who are you|what is ask zyliad|what is ask relay)$/.test(
      q,
    )
  )
    return "Je suis Ask Zyliad, l’assistant IA officiel du CRM Zyliad, propulsé par OpenAI. Je vous aide à retrouver les informations autorisées, analyser votre activité commerciale et préparer ou effectuer des actions selon vos permissions et les confirmations nécessaires.";
  if (/^(?:bonjour|bonsoir|salut|hello|hey)$/.test(q))
    return "Bonjour ! Je suis Ask Zyliad, l’assistant IA de Zyliad, propulsé par OpenAI. Que souhaitez-vous retrouver, analyser ou organiser dans votre CRM ?";
  if (/^(?:merci|merci beaucoup|thanks|thank you)$/.test(q))
    return "Avec plaisir. Je reste disponible pour la suite.";
  return null;
}
