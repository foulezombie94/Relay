import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { AuthFrame } from "@/components/onboarding/auth-frame";
import styles from "@/components/onboarding/onboarding.module.css";
import { emailLink } from "@/lib/supabase/email-link";
import { db } from "@/lib/supabase/server";
export const metadata: Metadata = {
  title: "Confirmer votre accès · Zyliad",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export default async function VerifyEmailLink({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value])
      query.append(key, item);
  const link = emailLink(query);
  if (!link) redirect("/login?error=expired");
  const client = await db();
  const {
    data: { user },
  } = await client.auth.getUser();
  return (
    <AuthFrame>
      <div className={styles.verificationIcon}>
        <MailCheck size={28} />
      </div>
      <span className={styles.verificationEyebrow}>VOTRE ACCÈS ZYLIAD</span>
      <h1>{link.type === "recovery" ? "Retrouvez votre espace." : "Confirmez votre adresse."}</h1>
      <p className={styles.subtitle}>
        Continuez uniquement si vous avez demandé cet e-mail. Ce lien ouvrira la session du compte
        auquel il a été envoyé.
      </p>
      {user && (
        <p className={styles.hint}>
          Vous êtes actuellement connecté à {user.email}. Continuer peut vous faire changer de
          compte.
        </p>
      )}
      <form action="/auth/confirm" method="post" className={styles.form}>
        <input type="hidden" name="token_hash" value={link.tokenHash} />
        <input type="hidden" name="type" value={link.type} />
        <input type="hidden" name="next" value={link.next} />
        <button className={styles.primary}>Confirmer et continuer</button>
      </form>
      <p className={styles.account}>
        <Link href="/login">Annuler et revenir à la connexion</Link>
      </p>
    </AuthFrame>
  );
}
