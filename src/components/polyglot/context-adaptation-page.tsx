import { useMemo, useState, type FormEvent } from "react";
import {
  BookOpenText,
  CircleAlert,
  FolderPlus,
  History,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { adaptContext, isDemoMode } from "@/lib/polyglot-api";
import {
  STARTER_DOMAINS,
  activeVocabulary,
  addTerm,
  preferencesStore,
  sessionStore,
  usePreferences,
  useSession,
} from "@/lib/polyglot-store";
import { diffWords } from "@/lib/word-diff";
import { EmptyState, ModeBadge, Notice, PageHeading, SectionHeading, Surface } from "./ui";

export function ContextAdaptationPage() {
  const session = useSession();
  const prefs = usePreferences();
  const vocab = activeVocabulary(session);
  const isStarter = session.domain in STARTER_DOMAINS;

  const [newWord, setNewWord] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [transcript, setTranscript] = useState("");
  const [adapted, setAdapted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setTerms = (terms: string[]) =>
    sessionStore.set((s) => ({ domains: { ...s.domains, [s.domain]: terms } }));

  function onAddTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parts = newWord
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    let next = vocab;
    for (const part of parts) next = addTerm(next, part);
    setTerms(next);
    setNewWord("");
  }
  function onAddDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newDomain.trim().replace(/\s+/g, " ");
    if (!name) return;
    const existing = Object.keys(session.domains).find(
      (d) => d.toLowerCase() === name.toLowerCase(),
    );
    sessionStore.set((s) => ({
      domain: existing ?? name,
      domains: existing ? s.domains : { ...s.domains, [name]: [] },
    }));
    setNewDomain("");
    setAdapted("");
  }
  function deleteDomain() {
    if (isStarter) return;
    sessionStore.set((s) => {
      const { [s.domain]: _removed, ...rest } = s.domains;
      return { domains: rest, domain: Object.keys(rest)[0] ?? "Machine Learning" };
    });
  }

  async function adapt() {
    if (!transcript.trim() || isDemoMode) return;
    setBusy(true);
    setError("");
    setAdapted("");
    try {
      const response = await adaptContext({
        transcript,
        domain: session.domain,
        vocabulary: prefs.contextualRescoring ? vocab : [],
      });
      setAdapted(response.adapted);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Adaptation unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const diff = useMemo(
    () => (adapted ? diffWords(transcript, adapted) : null),
    [transcript, adapted],
  );
  const changed = diff ? diff.adapted.filter((p) => p.type === "added").length : 0;

  return (
    <>
      <PageHeading eyebrow="Lexical adaptation" title="Context Adaptation" action={<ModeBadge />}>
        Maintain domain vocabulary so technical terms in Hindi–English speech are recognised
        correctly. Vocabulary is kept for this browser session and sent with every transcription.
      </PageHeading>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-5">
          <Surface className="px-5 py-5">
            <SectionHeading
              title="Domain vocabulary"
              detail={`${vocab.length} term${vocab.length === 1 ? "" : "s"} in ${session.domain}`}
            />
            <label htmlFor="domain-select" className="mb-2 block text-xs font-medium">
              Research domain
            </label>
            <div className="flex gap-2">
              <select
                id="domain-select"
                value={session.domain}
                onChange={(e) => {
                  sessionStore.set({ domain: e.target.value });
                  setAdapted("");
                }}
                className="field h-9 px-3"
              >
                {Object.keys(session.domains).map((d) => (
                  <option key={d} value={d}>
                    {d}
                    {d in STARTER_DOMAINS ? "" : " (custom)"}
                  </option>
                ))}
              </select>
              {isStarter ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Reset to starter terms"
                  title="Reset to starter terms"
                  onClick={() => setTerms(STARTER_DOMAINS[session.domain] ?? [])}
                >
                  <RotateCcw />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Delete custom domain"
                  title="Delete custom domain"
                  onClick={deleteDomain}
                >
                  <Trash2 />
                </Button>
              )}
            </div>

            <div className="mt-4 flex min-h-12 flex-wrap gap-2" aria-live="polite">
              {vocab.length ? (
                vocab.map((word) => (
                  <span
                    key={word}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 py-1 pl-2.5 pr-1 text-xs"
                  >
                    {word}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${word}`}
                      className="size-5 text-muted-foreground hover:text-foreground"
                      onClick={() => setTerms(vocab.filter((t) => t !== word))}
                    >
                      <X className="size-3" />
                    </Button>
                  </span>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  No terms yet — add the first one below.
                </p>
              )}
            </div>

            <form className="mt-4 flex gap-2" onSubmit={onAddTerm}>
              <Input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                placeholder="Add terms (comma-separated)"
                aria-label="Add vocabulary terms"
                maxLength={200}
              />
              <Button
                type="submit"
                variant="outline"
                size="icon"
                aria-label="Add vocabulary term"
                disabled={!newWord.trim()}
              >
                <Plus />
              </Button>
            </form>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
              <div>
                <p className="text-xs font-medium">Contextual rescoring</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Send these terms with recognition and adaptation requests
                </p>
              </div>
              <Switch
                checked={prefs.contextualRescoring}
                onCheckedChange={(v) => preferencesStore.set({ contextualRescoring: v })}
                aria-label="Enable contextual rescoring"
              />
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <SectionHeading title="Add a custom domain" detail="E.g. Medicine, Finance, Law" />
            <form className="flex gap-2" onSubmit={onAddDomain}>
              <Input
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="Domain name"
                aria-label="New domain name"
                maxLength={40}
              />
              <Button type="submit" variant="outline" disabled={!newDomain.trim()}>
                <FolderPlus className="size-4" />
                Create
              </Button>
            </form>
            <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {Object.entries(session.domains).map(([name, terms]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    sessionStore.set({ domain: name });
                    setAdapted("");
                  }}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left transition-colors",
                    name === session.domain
                      ? "border-primary/40 bg-primary/[0.05]"
                      : "border-border hover:border-primary/25 hover:bg-accent/40",
                  )}
                  aria-pressed={name === session.domain}
                >
                  <p className="eyebrow mb-1 text-muted-foreground">{name}</p>
                  <p className="line-clamp-2 text-xs leading-5">
                    {terms.length ? (
                      terms.join(" · ")
                    ) : (
                      <span className="text-muted-foreground">Empty</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          </Surface>
        </div>

        <div className="space-y-5">
          <Surface className="px-5 py-5">
            <SectionHeading
              title="Adapt a transcript"
              detail="The backend rewrites the transcript using the selected domain vocabulary"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!session.lastResult}
                  onClick={() => {
                    if (session.lastResult) {
                      setTranscript(session.lastResult.transcript);
                      setAdapted("");
                    }
                  }}
                >
                  <History className="size-3.5" />
                  Use last transcript
                </Button>
              }
            />
            <label className="sr-only" htmlFor="context-transcript">
              Original transcript
            </label>
            <textarea
              id="context-transcript"
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                setAdapted("");
              }}
              placeholder="Paste a transcript from a real model run…"
              className="field transcript-copy min-h-28 resize-y px-3 py-3 leading-7"
            />
            <Button
              className="mt-3 w-full"
              disabled={!transcript.trim() || isDemoMode || busy}
              onClick={() => void adapt()}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isDemoMode
                ? "Connect backend to adapt"
                : busy
                  ? "Adapting…"
                  : `Adapt with ${session.domain}`}
            </Button>
            {isDemoMode && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                No speculative corrections are generated in demo mode — your vocabulary is still
                saved and ready.
              </p>
            )}
            {error && (
              <div className="mt-3">
                <Notice tone="error" icon={CircleAlert}>
                  {error}
                </Notice>
              </div>
            )}
          </Surface>

          <Surface className="px-5 py-5">
            <SectionHeading
              title="Side-by-side comparison"
              detail={
                diff
                  ? `${changed} word${changed === 1 ? "" : "s"} changed by adaptation`
                  : "Original on the left, adapted on the right"
              }
            />
            {transcript.trim() ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="eyebrow mb-2 text-muted-foreground">Original</p>
                  <div className="transcript-copy min-h-28 rounded-md border border-border bg-background/30 p-3 text-sm leading-7">
                    {diff
                      ? diff.original.map((p, i) => (
                          <span
                            key={i}
                            className={cn(
                              p.type === "removed" &&
                                "rounded-sm bg-destructive/15 text-destructive line-through decoration-destructive/60",
                            )}
                          >
                            {p.text}{" "}
                          </span>
                        ))
                      : transcript}
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-2 flex items-center gap-1.5 text-primary">
                    <Sparkles className="size-3" />
                    Context-adapted
                  </p>
                  <div className="transcript-copy min-h-28 rounded-md border border-primary/25 bg-primary/[0.04] p-3 text-sm leading-7">
                    {busy ? (
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <LoaderCircle className="size-3.5 animate-spin" />
                        Waiting for the backend…
                      </span>
                    ) : diff ? (
                      diff.adapted.map((p, i) => (
                        <span
                          key={i}
                          className={cn(
                            p.type === "added" && "rounded-sm bg-primary/20 text-primary",
                          )}
                        >
                          {p.text}{" "}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        The adapted transcript appears here after a backend request.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={BookOpenText}
                title="Nothing to compare yet"
                detail="Paste a transcript above or reuse your last transcription."
              />
            )}
          </Surface>
        </div>
      </div>
    </>
  );
}
