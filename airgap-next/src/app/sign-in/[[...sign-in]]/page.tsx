import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <a href="/" className="font-display text-4xl font-bold text-ink">
            airgap<span className="text-rust">.</span>life
          </a>
        </div>
        <SignIn />
      </div>
    </main>
  );
}
