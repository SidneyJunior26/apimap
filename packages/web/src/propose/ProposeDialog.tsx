import { useEffect, useRef, useState } from 'react';

export interface Proposal {
  kind: 'new' | 'edit';
  url: string;
  yaml: string;
  /** True when GitHub receives the content in the link; otherwise the user pastes it. */
  prefilled: boolean;
  file: string;
}

interface Props {
  proposal: Proposal;
  onClose: () => void;
}

/** Last step of a proposal: hands over to GitHub, where the pull request is created. */
export function ProposeDialog({ proposal, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(proposal.yaml);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };

  const needsPaste = !proposal.prefilled;
  return (
    <dialog ref={ref} className="confirm propose" aria-labelledby="propose-title" onCancel={(e) => (e.preventDefault(), onClose())}>
      <h2 id="propose-title">Continue on GitHub</h2>
      <ol>
        {needsPaste && (
          <li>
            Copy the new content of <code>{proposal.file}</code>.
          </li>
        )}
        <li>Open GitHub. You need to be signed in; if you cannot push to the repository, GitHub creates a fork for you.</li>
        {needsPaste && <li>{proposal.kind === 'edit' ? 'Select all the text in the editor and paste.' : 'Paste the content into the empty file.'}</li>}
        <li>Click "Commit changes", choose "Create a new branch" and open the pull request.</li>
      </ol>
      <details>
        <summary>Show YAML</summary>
        <pre className="propose__yaml">{proposal.yaml}</pre>
      </details>
      {copied === 'failed' && (
        <p className="field-error" role="alert">
          The browser blocked the clipboard. Select the YAML above and copy it by hand.
        </p>
      )}
      <div className="confirm__actions">
        <button type="button" className="chip" onClick={onClose}>
          Close
        </button>
        {needsPaste && (
          <button type="button" className="chip" onClick={() => void copy()}>
            {copied === 'done' ? 'Copied' : 'Copy YAML'}
          </button>
        )}
        <a className="chip chip--on" href={proposal.url} target="_blank" rel="noopener noreferrer" onClick={() => needsPaste && void copy()}>
          Open GitHub
        </a>
      </div>
    </dialog>
  );
}
