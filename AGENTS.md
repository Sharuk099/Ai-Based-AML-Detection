<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Never seed bundled synthetic AML models into the model registry; only explicit user training/import may provide a model, because demo scores are not verified banking performance.
- Fit preprocessing and graph reference statistics on training rows only and reuse the saved state for inference, so uploaded batch composition cannot change model features.
- Preserve original trained feature names and reject missing or unseen required inputs before presenting classification, because fabricated defaults create unsupported evidence.
- Keep the Python AML folder standalone; the live TanStack app runs browser-side training and does not host Flask.
