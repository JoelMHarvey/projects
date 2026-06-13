import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <a href="/" className="font-display text-4xl font-bold text-ink">
            airgap<span className="text-rust">.</span>life
          </a>
          <p className="mt-2 font-body text-sm text-fog">
            Create a free account — or upgrade to member for £8/month.
          </p>
        </div>
        <SignUp />
      </div>
    </main>
  );
}
