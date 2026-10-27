# Facebook UI research for PasarPilot

Research date: 2026-10-26. Method: a small, user-authorised sample viewed through Chrome DevTools MCP in an existing Brave session. Browser inspection stopped once the sample established the main workflow and architectural risks.

This note contains structural observations and paraphrased workflow findings. It deliberately excludes participant identities, personal message text, contact details, payment documents, account identifiers, cookies, credentials, recovery secrets, and authentication tokens. No application functionality was implemented during this UI inspection.

Follow-up on 2026-10-27: the [bounded browser lifecycle experiment](bounded-browser-lifecycle.md) completed against synthetic fixtures. Its persistence, isolation and resource results do not confirm Facebook/Messenger behaviour; no further live UI inspection was used for that experiment.

## Agreed product boundary

- The operator will host several invited sellers on a Linux homelab.
- The first useful release covers WTS claims through seller-confirmed payment and collection.
- WTB matching and auction settlement are later workflows.

## Confirmed observations

### Group posts and listing structure

- The inspected community is a private Facebook group.
- WTS posts can describe a sale globally while individual items appear as photo comments beneath the post. Buyer claims can be replies beneath a particular item photo.
- An inspected item photo showed multiple cards with overlaid MYR prices and a finish abbreviation. The parent sale stated that prices applied per card.
- Other WTS posts used a CKD multiplier, finish annotations, scheduled shop drop-offs, time-limited sales, or quantity-based discounts. The meaning and calculation basis of CKD were not independently verified.
- A WTS sale explicitly allowed backup claims. Another visible sale had commenting disabled.
- WTB posts specified some combination of quantity, condition, language, finish, printing or artwork restrictions, desired price basis, and preferred drop-off location.
- An inspected auction specified a starting bid, minimum increment, buyout, closing date/time, extension rule, payment deadline, and fulfilment terms. Its own wording described minute-level Facebook timestamp ambiguity. This was a seller's rule, not proof that every Facebook surface lacks seconds.

### Messenger and transaction flow

- Facebook authentication succeeded before historical Messenger content was available. Messenger displayed a missing-history notice and requested a separate history-unlock step. The user completed that step directly; history then became visible.
- One sampled seller-side transaction progressed through item confirmation, quoted MYR price, a choice between postage and shop drop-off, an agreed drop-off schedule, payment evidence and collection details, and later collection acknowledgement.
- Another sampled transaction, with the account acting as buyer, included a price quote, a request for QR or bank instructions, a seller-approved payment delay, payment evidence, and subsequent follow-up.
- A short additional exchange showed that shop-location preferences can be clarified after earlier arrangements. The full preceding context of that exchange was not examined.
- Payment evidence appeared as an attachment in the UI. Attachments were not opened or downloaded, and no bank settlement was checked.
- Social conversation and transaction messages can coexist in the same thread.
- Older messages loaded incrementally when scrolling inside the conversation, rather than by scrolling the surrounding group page.

### Relevant UI structures and selectors

These are observed discovery anchors, not a stable Facebook integration contract. Accessible names reflect the inspected English UI. Dynamic DevTools node UIDs were intentionally not saved.

| Surface | Observed anchor | Use and limitation |
| --- | --- | --- |
| Group content | `[role="main"]` | Useful scope on the group page; scope again after navigation or dialogs. |
| Group search | Button named `Search within this group`; combobox named `Search this group` on results | Search WTS/WTB without scanning the whole feed. Search completeness and ordering were not tested. |
| Expanded post | `[role="dialog"]`, with a post-specific accessible label | Multiple overlays can coexist; selecting the first dialog can return the wrong surface. |
| Truncated post body | Button named `See more` | Expands sale or auction terms; does not establish that all replies are loaded. |
| Comment and reply | `[role="article"]`, with accessible labels distinguishing comment from reply | Preserve the parent item comment when interpreting a claim. Do not use a participant's name as a production selector. |
| Reply expansion | Buttons named `View 1 reply`, `View 3 replies`, etc. | Replies may remain collapsed until explicitly expanded. Counts are variable. |
| Comment ordering | Button named `All comments` | The inspected post showed this label. Completeness, hidden comments and chronological guarantees remain unverified. |
| Photo viewer | A main image plus controls such as `Close` and `Zoom In` | Text alternatives were generic; they did not expose the full card and price content visible in the image. |
| Messenger entry | Button whose accessible name starts with `Messenger` | Unread-count suffixes vary. |
| Messenger discovery | Combobox named `Search Messenger`; link named `See all in Messenger` | Prefer seller-selected trading threads over broad mailbox ingestion. Search behaviour was not tested. |
| Conversation | `[role="log"]`, labelled as messages in a conversation | Scope to the intended thread. Message descendants exposed sender/time context and message content; no personal values are retained here. |
| Conversation history | A descendant of the message log with computed `overflow-y: auto` or `scroll` | In the inspected chat window the scrollable element was inside the log, not an ancestor. Treat this as a discovery method, not a stable selector. |
| History locked | Missing-history notice and textbox named `PIN` | Pause automation and ask the seller to unlock history directly in the remote browser. Never collect the PIN through PasarPilot. |
| Composer | Region named `Thread composer` with a multiline textbox | Keep readers separate from writers. No message was sent during research. |

Observed navigation shapes included `/groups/<group-id>/permalink/<post-id>/` and `/messages/e2ee/t/<thread-id>/`. Actual identifiers are omitted. Their suitability as durable identifiers across Facebook surfaces remains unverified.

The browser tool's fill operation appended to one existing search value. Explicit selection followed by replacement produced the intended value. An automation prototype should verify the actual resulting field value before submitting; this observation does not establish a universal Facebook input rule.

## Architectural implications

These are recommendations inferred from the sample, not validated implementation results.

1. Model a sale post, its item/photo comments, and buyer replies separately. Let sellers explicitly map a listing or comment to inventory; defer automatic card recognition.
2. Treat a claim as an interpretation requiring a specific item, quantity, buyer identity and source context. A mention, reaction or unrelated reply must not reserve stock.
3. Keep reservations, payment status and fulfilment status separate. Evidence received is not payment verified; shop drop-off is not buyer collection.
4. Store agreed price and fulfilment snapshots on the order. Later inventory-price changes or conversational location changes must not silently rewrite an agreement.
5. Support seller-approved payment deadlines and hold extensions. Do not infer that a generic acknowledgement authorises either.
6. Separate browser health, Facebook authentication, Messenger history readiness and manual-control ownership.
7. Begin with seller-selected posts and trading threads. A full authenticated mailbox exposes unrelated personal conversations that PasarPilot does not need.
8. Use deterministic inventory and pricing rules. AI may propose intent and item matches from a minimal context window; it should not verify payment, resolve claim priority or settle auctions.
9. Treat absent UI content as potentially unloaded or unavailable. Incremental loading and collapsed replies prevent an empty DOM result from proving that nothing happened.
10. Gate browser integration on platform permission and product-risk decisions. Seeing a workflow in the UI does not establish permission to automate it.

## Assumptions and unresolved questions

- CKD's reference source, price timestamp, variant mapping, multiplier and rounding rules require seller confirmation. MVP prices should be explicit MYR amounts approved by the seller.
- Stable source identifiers, comment edits/deletions, complete ordering, pagination and reliable comment-to-Messenger identity linking have not been validated.
- Synthetic profile persistence, tenant isolation, exclusive mode handoff and uncertain-action handling were subsequently exercised in the [controlled fixture benchmark](bounded-browser-lifecycle.md). Real Facebook profile restoration, Messenger encrypted-history recovery and external send reconciliation remain unverified.
- No send operation, automated bid, payment verification or reservation was performed.
- This UI inspection measured no restriction rates, long-running reliability or browser resources. The separate fixture resource benchmark does not measure Facebook load or predict Meta enforcement.
- The sample does not establish support for every language, mobile layout, attachment type, group setting, auction rule or trade pattern.
- A third-party receipt or screenshot alone cannot establish payment settlement. The MVP requires seller confirmation after checking a trusted account or a trusted provider integration.
- Seller permission to inspect an account is distinct from Meta permission to automate access, and from the handling requirements for buyers' personal data.

## Recommended next evidence

Use this document instead of further live browsing for the architecture discussion. The bounded browser-isolation prototype has now completed against synthetic fixtures. The next proposed change is `schedule-bounded-fixture-visits`, covering durable scheduling and recovery without real platform access. Any later live-platform testing should have a specific unanswered question, an explicit stop condition and a review of the permitted integration path.
