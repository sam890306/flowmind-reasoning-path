// Sample data for the AutoResearch console. Everything here is illustrative:
// the engine in engine.js replays these scripts so the UI has something live to show.

export const LIFE = [
  { k: 'Enroll', where: 'A→B', d: 'munge proof, operator approval, quota' },
  { k: 'Create', where: 'A→B', d: 'repo snapshot, goal, Slurm job, cap and clock' },
  { k: 'Provision', where: 'B', d: 'framework clone, venvs, sandbox, CPU slot' },
  { k: 'Set up', where: 'B+C', d: 'manifest, frozen evaluator, baseline' },
  { k: 'Research loop', where: 'B+C', d: 'ideas → implement → screen → promote' },
  { k: 'Finalize', where: 'B', d: 'final review of promoted changes' },
  { k: 'Verify', where: 'B+C', d: 'clean checkout, held-out data' },
  { k: 'Deliver', where: 'B→A', d: 'patch + REPORT.md' },
]

export const HSTAGES = [
  { k: 'idea', label: 'Ideas', hint: 'proposed by Agent 2' },
  { k: 'plan', label: 'Planning', hint: 'planner + reviewer' },
  { k: 'implement', label: 'Implementing', hint: 'sandboxed worker' },
  { k: 'screen', label: 'Screening', hint: "engine's first measurement" },
  { k: 'promote', label: 'Re-measuring', hint: 'isolated, pinned slot' },
  { k: 'kept', label: 'Promoted', hint: 'in the candidate patch' },
  { k: 'discarded', label: 'Discarded', hint: 'with the reason why' },
]

export const REASONS = {
  NO_GAIN: { label: 'No measurable gain', at: 'screen' },
  REGRESSION: { label: 'Regression', at: 'screen' },
  CORRECTNESS: { label: 'Correctness check failed', at: 'screen' },
  CONSTRAINT: { label: 'Constraint violated', at: 'screen' },
  TIMEOUT: { label: 'Stage timed out', at: 'screen' },
  BUILD: { label: 'Build failed on node', at: 'implement' },
  EVALUATOR: { label: 'Touched the frozen evaluator', at: 'implement' },
  BUDGET: { label: 'Cost cap reached · HTTP 402', at: 'implement' },
  NOT_REPRODUCED: { label: 'Did not reproduce in isolation', at: 'promote' },
  CUT: { label: 'Stopped at finalize', at: 'any' },
}

export const USERS = [
  { id: 'you', name: 'You', handle: 'you', role: 'operator', quota: 1500, maxActive: 3, node: 'login-02' },
  { id: 'mira', name: 'Mira Okafor', handle: 'mokafor', role: 'member', quota: 1200, maxActive: 2, node: 'gpu-a100-11' },
  { id: 'jonas', name: 'Jonas Lindqvist', handle: 'jlindqvist', role: 'member', quota: 1200, maxActive: 2, node: 'gpu-h100-03' },
  { id: 'priya', name: 'Priya Raman', handle: 'praman', role: 'member', quota: 800, maxActive: 1, node: 'gpu-a100-04' },
  { id: 'teo', name: 'Teo Alvarez', handle: 'talvarez', role: 'viewer', quota: 0, maxActive: 0, node: 'login-01' },
]

export const ENROLLMENTS = [
  { id: 'enr-1', name: 'Hana Sato', handle: 'hsato', node: 'gpu-a100-09', proof: 'munge · uid 48213 · ttl 300s', asked: 'Member · $800 / month' },
  { id: 'enr-2', name: 'Ilya Brandt', handle: 'ibrandt', node: 'login-02', proof: 'munge · uid 51877 · ttl 300s', asked: 'Viewer' },
]

export const PERMS = [
  ['See campaigns, feeds and results', 1, 1, 1],
  ['Create a campaign (within quota)', 0, 1, 1],
  ['Pause, steer, answer, finalize own campaigns', 0, 1, 1],
  ['Control any campaign in the lab', 0, 0, 1],
  ['Download patch and REPORT.md', 0, 1, 1],
  ['Approve enrollments, set roles and quotas', 0, 0, 1],
  ['See lab-wide usage and chargeback', 0, 0, 1],
  ['Revoke tokens, read the audit log', 0, 0, 1],
]

export const HARD_LINES = [
  ['No held-out data for agents or the run', 'Stays on host-local disk; only the verifier copies it to the node.'],
  ['No secrets in sandboxes', 'The real key lives in the proxy. Sandboxes get scoped, capped, revocable tokens.'],
  ['Cost cap and clock', 'The proxy reserves per role before each call: over the cap → 402, past the deadline → 403.'],
  ['Trustworthy score', 'The evaluator is frozen. Patches that touch it are rejected; only the verifier reports.'],
]

const h = (t, why, plan, files, fate, g, gp, rej, par) => ({ t, why, plan, files, fate, g, gp, rej, par })

export const SEEDS = [
  {
    id: 'pandas-7f3a', name: 'pandas nullable reductions', repo: 'github.com/pandas-dev/pandas', sha: '9c1e4b2',
    goal: 'Make groupby reductions on nullable Int64 / Float64 columns faster without changing results.',
    metric: { label: 'groupby-sum speedup', unit: '×', baseline: 1, dir: 'up', digits: 2 },
    owner: 'you', node: 'gpu-a100-07', job: 4812207, gpus: 1, cap: 400, clockH: 10, warm: 92, generic: 4,
    hyps: [
      h('Skip mask allocation when the validity bitmap is all-valid',
        'Profiles show 38% of time in np.zeros for a mask that is never set. An all-valid fast path avoids it.',
        ['Add an all-valid check on the bitmap before the reduction', 'Route to the unmasked kernel when it holds'],
        [['pandas/core/arrays/masked.py', 41, 9], ['pandas/core/array_algos/masked_reductions.py', 28, 6]], 'keep', 0.31, 0.29),
      h('Pre-size result buffers with np.empty instead of np.zeros',
        'Zero-filling result buffers that are fully overwritten is wasted work.',
        ['Swap np.zeros for np.empty in the group result allocation'],
        [['pandas/core/groupby/ops.py', 6, 6]], 'NO_GAIN', 0.004, null,
        { d: 'The change is correct but the gain sits inside the noise band of the benchmark.', ev: [['Screening', '+0.4%'], ['Noise band (5 runs)', '±1.8%'], ['Decision threshold', '+2.0%']], lesson: 'Allocation is not the bottleneck once the mask is skipped. Stop exploring allocator tweaks.' }),
      h('Replace pairwise summation with a plain accumulate loop',
        'The pairwise kernel has call overhead per block; a flat loop may vectorise better.',
        ['Write a flat accumulate loop for float64', 'Keep pairwise for float32'],
        [['pandas/_libs/groupby.pyx', 54, 31]], 'CORRECTNESS', null, null,
        { d: 'Float64 sums drift past the tolerance in the correctness stage. The run never reached a timed measurement.', ev: [['Cases failed', '4 / 212'], ['Max relative error', '3.1e-11'], ['Tolerance', '1.0e-12']], lesson: 'Summation order is part of the contract. Any kernel must keep pairwise order for float64.' }),
      h('Fused-type Cython kernel for masked sum and mean',
        'With the all-valid path in place, the remaining cost is a generic object-level loop for masked groups.',
        ['One fused-type kernel for Int64 / Float64', 'Read the bitmap word-wise', 'Keep pairwise order for floats'],
        [['pandas/_libs/groupby.pyx', 118, 22], ['pandas/core/groupby/ops.py', 17, 4]], 'keep', 0.34, 0.31, null, 1),
      h('Reduce benchmark warm-up iterations to cut variance',
        'Fewer warm-up rounds would shorten each screening run.',
        ['Lower warmup_time in the asv config'],
        [['asv_bench/asv.conf.json', 2, 2], ['asv_bench/benchmarks/groupby.py', 5, 3]], 'EVALUATOR', null, null,
        { d: 'The patch edits files covered by the frozen evaluator manifest. The guard rejected it before any run.', ev: [['Files in manifest', '2 of 2'], ['Evaluator sha256', 'a41f…c09e (frozen at set-up)'], ['Guard', 'patch rejected']], lesson: 'The benchmark is off limits. Variance has to be handled by asking the teammate for more repeats.' }),
      h('Thread the group loop with prange',
        'Groups are independent, so the outer loop can run across cores.',
        ['Release the GIL in the kernel', 'prange over group chunks'],
        [['pandas/_libs/groupby.pyx', 37, 12]], 'NOT_REPRODUCED', 0.12, 0.009,
        { d: 'Screening showed a gain, but the isolated re-measurement on the pinned 8-core slot did not. Screening had borrowed idle neighbour cores.', ev: [['Screening', '+12.0%'], ['Promoted re-measurement', '+0.9%'], ['Cores visible in screening', '24'], ['Cores in pinned slot', '8']], lesson: 'Threading wins only appear with spare cores. Judge parallel ideas on the pinned slot from the start.' }),
      h('Popcount fast path: derive count() from the bitmap',
        'count() scans values although the answer is the number of set validity bits per group.',
        ['Popcount bitmap words per group', 'Fall back for unsorted group codes'],
        [['pandas/_libs/groupby.pyx', 46, 3], ['pandas/core/arrays/masked.py', 12, 2]], 'keep', 0.09, 0.08, null, 1),
      h('Avoid the object-dtype fallback for BooleanArray any / all',
        'any / all on BooleanArray round-trips through object dtype.',
        ['Dispatch to the masked kernel with uint8 views'],
        [['pandas/core/arrays/boolean.py', 23, 14]], 'keep', 0.05, 0.05),
      h('Inline the NA check with bit tricks in the min / max kernel',
        'A branch-free NA test might help min / max the same way it helped sum.',
        ['Replace the branch with a mask multiply'],
        [['pandas/_libs/groupby.pyx', 29, 18]], 'REGRESSION', -0.06, null,
        { d: 'The branch-free version is slower: the branch was well predicted and the multiply adds a dependency.', ev: [['Screening', '−6.1%'], ['Branch miss rate before', '0.3%'], ['IPC before → after', '2.9 → 2.4']], lesson: 'NA branches on mostly-valid data are cheap. Leave min / max alone.' }, 4),
      h('SIMD masked sum through the NumPy where= reduction',
        'NumPy 2.1 has a vectorised where= path that could replace the hand-written loop.',
        ['Call np.add.reduce with where=mask for contiguous groups'],
        [['pandas/core/array_algos/masked_reductions.py', 19, 8]], 'BUILD', null, null,
        { d: 'The check stage failed on the node: the frozen environment pins NumPy 1.26, which lacks the fast path.', ev: [['Stage', 'check'], ['Error', 'ImportError: requires numpy>=2.1'], ['Pinned', 'numpy==1.26.4']], lesson: 'The environment is part of the frozen manifest. Only propose what runs on the pinned versions.' }),
      h('Reuse group-code factorisation across consecutive reductions',
        'agg([sum, mean, count]) factorises the keys three times.',
        ['Cache codes on the grouper for the duration of one agg call'],
        [['pandas/core/groupby/grouper.py', 31, 7]], 'keep', 0.07, 0.06),
    ],
  },
  {
    id: 'hnsw-22c9', name: 'HNSW query throughput', repo: 'git.lab.internal/search/vecindex', sha: '51b07de',
    goal: 'Raise single-thread QPS on the 10M × 768 set while holding recall@10 at 0.95 or better.',
    metric: { label: 'QPS at recall@10 ≥ 0.95', unit: ' QPS', baseline: 4120, dir: 'up', digits: 0 },
    owner: 'mira', node: 'gpu-a100-11', job: 4812990, gpus: 1, cap: 320, clockH: 8, warm: 74, generic: 3,
    hyps: [
      h('Software prefetch of neighbour adjacency lists',
        'Graph traversal is dominated by cache misses when hopping to neighbours.',
        ['Prefetch the next two adjacency lists while scoring the current one'],
        [['src/hnsw/search.cc', 22, 3]], 'keep', 0.14, 0.13),
      h('PQ-approximate distances for candidate pruning',
        'Scoring candidates with 16-byte PQ codes is far cheaper than full 768-d distances.',
        ['Train PQ on a sample', 'Prune with approximate distance, rerank top 32'],
        [['src/hnsw/pq.cc', 211, 0], ['src/hnsw/search.cc', 48, 9]], 'CONSTRAINT', 0.41, null,
        { d: 'Throughput jumped, but recall fell under the floor set in the goal. The result does not count.', ev: [['Screening QPS', '+41%'], ['recall@10', '0.921'], ['Required', '≥ 0.950']], lesson: 'Approximation needs a wider rerank or finer codes. Try scalar int8 next, which loses less.' }),
      h('Reorder graph nodes by BFS for cache locality',
        'Neighbours of a node are scattered across the arena.',
        ['Relabel node ids in BFS order from the entry point at build time'],
        [['src/hnsw/build.cc', 64, 5]], 'keep', 0.11, 0.1),
      h('AVX-512 batched L2 kernel',
        'Scoring 16 floats per instruction should nearly double the distance kernel.',
        ['Add an AVX-512 kernel behind a compile flag'],
        [['src/simd/l2_avx512.cc', 96, 0], ['CMakeLists.txt', 4, 0]], 'BUILD', null, null,
        { d: 'The binary crashed in the check stage. The teammate’s node has no AVX-512.', ev: [['Stage', 'check'], ['Signal', 'SIGILL (illegal instruction)'], ['Node CPU', 'EPYC 7543 · avx2, no avx512f']], lesson: 'Target AVX2 with unrolling instead. Node capabilities are now recorded in the manifest.' }),
      h('Replace the visited set with a bloom filter',
        'The visited bitmap is cleared per query; a small bloom filter avoids the clear.',
        ['Two-hash bloom filter sized to ef_search'],
        [['src/hnsw/visited.h', 39, 21]], 'NO_GAIN', 0.011, null,
        { d: 'Clearing the bitmap was already cheap after the prefetch change. The difference is inside the noise.', ev: [['Screening', '+1.1%'], ['Noise band (5 runs)', '±1.5%']], lesson: 'Visited-set cost is negligible. Spend remaining budget on the distance kernel.' }),
      h('AVX2 batched L2 with 4-way unrolling',
        'Follow-up to the failed AVX-512 kernel, limited to what the node supports.',
        ['4 accumulators, FMA', 'Runtime dispatch on cpuid'],
        [['src/simd/l2_avx2.cc', 71, 12]], 'keep', 0.19, 0.17, null, 4),
      h('int8 scalar quantisation with full-precision rerank',
        'Follow-up to PQ: int8 codes lose much less accuracy and quarter the memory traffic.',
        ['Quantise per dimension', 'Rerank top 48 at full precision'],
        [['src/hnsw/sq8.cc', 143, 0], ['src/hnsw/search.cc', 37, 6]], 'keep', 0.22, 0.2, null, 2),
      h('Choose entry points from cluster centroids',
        'Starting closer to the query shortens the walk on the upper layers.',
        ['k-means over 4096 centroids at build time'],
        [['src/hnsw/build.cc', 88, 2]], 'TIMEOUT', null, null,
        { d: 'Rebuilding the index with the clustering step ran past the limit of the timed stage.', ev: [['Stage', 'collect (timed)'], ['Limit', '20 min'], ['Killed at', '20:00, index 61% built']], lesson: 'Build-time ideas need an incremental path or they cannot be measured inside one stage.' }),
      h('Stop early when the candidate heap stagnates',
        'Most queries find their final top-10 long before ef_search is exhausted.',
        ['Terminate after 6 rounds without heap improvement'],
        [['src/hnsw/search.cc', 18, 2]], 'keep', 0.07, 0.06),
    ],
    ask: { n: 5, text: 'Baseline variance on this node is 3.1%. Raise repeats from 5 to 9 (about +$18), or accept the wider noise band?', opts: ['Raise to 9 repeats', 'Keep 5 repeats'] },
  },
  {
    id: 'serve-a8d1', name: 'LLM serving throughput', repo: 'git.lab.internal/infra/serve-rt', sha: 'e77a310',
    goal: 'Increase generated tokens per second at 64 concurrent requests. Greedy outputs must stay identical.',
    metric: { label: 'generated tokens / s', unit: ' tok/s', baseline: 1840, dir: 'up', digits: 0 },
    owner: 'jonas', node: 'gpu-h100-03', job: 4813544, gpus: 2, cap: 520, clockH: 12, warm: 58, generic: 4,
    hyps: [
      h('Continuous batching: admit requests at every decode step',
        'The static batcher waits for a full batch; slots idle while short requests finish.',
        ['Admit from the queue each step', 'Compact finished rows in place'],
        [['serve/batcher.py', 132, 47], ['serve/engine.py', 28, 11]], 'keep', 0.38, 0.35),
      h('Cast logits to fp16 before sampling',
        'Half-precision logits halve the copy to the sampler.',
        ['Cast after the final projection'],
        [['serve/sampler.py', 9, 4]], 'CORRECTNESS', null, null,
        { d: 'Greedy outputs changed. The correctness stage compares tokens against the reference run.', ev: [['Sequences with a mismatch', '212 / 10,000'], ['First divergence (median)', 'token 187'], ['Requirement', 'identical greedy output']], lesson: 'Precision changes on the logit path break the identity requirement. Keep fp32 until after argmax.' }),
      h('Share KV-cache blocks across requests with a common prefix',
        'Most requests share a long system prompt that is recomputed each time.',
        ['Content-hash prefix blocks', 'Copy-on-write block table'],
        [['serve/kvcache.py', 164, 38]], 'keep', 0.21, 0.19),
      h('Speculative decoding with a distilled draft model',
        'A small draft model can propose 4 tokens per step for the large model to verify.',
        ['Distil a 2-layer draft', 'Verify in one batched pass'],
        [['serve/speculative.py', 240, 0]], 'BUDGET', null, null,
        { d: 'The implementer’s next call needed a reservation larger than what the role had left, so the proxy refused it.', ev: [['Proxy response', 'HTTP 402'], ['Reservation needed', '$31.40'], ['Implementer role remaining', '$22.15']], lesson: 'Too large for the remaining budget. Shelved; raise the cap to revisit.' }),
      h('Move top-p sampling onto the GPU',
        'Sampling syncs logits to the host every step.',
        ['Sort and cumsum on device', 'Return only token ids'],
        [['serve/sampler.py', 58, 27]], 'keep', 0.12, 0.11),
      h('Pinned-memory staging for tokenizer output',
        'Pageable host memory forces an extra copy on upload.',
        ['Allocate input staging buffers pinned'],
        [['serve/io.py', 14, 6]], 'NO_GAIN', 0.006, null,
        { d: 'Input upload is a tiny share of a decode step at this batch size.', ev: [['Screening', '+0.6%'], ['Noise band (5 runs)', '±1.2%']], lesson: 'Host-to-device input traffic is not on the critical path.' }),
      h('Count prompt tokens toward the throughput counter',
        'The counter ignores prompt tokens that the engine also processes.',
        ['Include prompt tokens in the total'],
        [['eval/throughput.py', 3, 1]], 'EVALUATOR', null, null,
        { d: 'This changes how the score is computed, not the system. The file belongs to the frozen evaluator.', ev: [['Files in manifest', '1 of 1'], ['Guard', 'patch rejected'], ['Logged to', 'tool server audit']], lesson: 'The metric definition is fixed by the teammate. Never propose edits under eval/.' }),
      h('Adaptive batching window by queue depth',
        'Follow-up to continuous batching: widen admission when the queue is deep.',
        ['Scale max rows with queue depth', 'Clamp by KV memory'],
        [['serve/batcher.py', 41, 8]], 'keep', 0.09, 0.08, null, 1),
      h('Fused attention kernel on the decode path',
        'A fused kernel avoids materialising the attention matrix for one new token.',
        ['Swap in the fused kernel for q_len = 1'],
        [['serve/attn.py', 33, 19]], 'NOT_REPRODUCED', 0.09, 0.005,
        { d: 'The gain vanished on re-measurement. During screening the baseline run had been throttled.', ev: [['Screening', '+9.0%'], ['Promoted re-measurement', '+0.5%'], ['GPU 1 temperature in baseline run', '87 °C, throttled']], lesson: 'Screening compares against a fresh baseline; promotion is what guards against a bad baseline.' }),
      h('Pre-allocate the KV arena',
        'The allocator is called on every admitted request.',
        ['Reserve the arena at start-up', 'Free-list of blocks'],
        [['serve/kvcache.py', 52, 20]], 'keep', 0.06, 0.05, null, 3),
    ],
  },
  {
    id: 'trainmem-3b10', name: 'Trainer peak memory', repo: 'git.lab.internal/rl/trainer', sha: '0d93fa4',
    goal: 'Cut peak GPU memory of one training step at batch 32 without changing the loss curve.',
    metric: { label: 'peak training memory', unit: ' GB', baseline: 41.2, dir: 'down', digits: 1 },
    owner: 'you', node: 'gpu-a100-07', job: 4809112, gpus: 2, cap: 300, clockH: 8, warm: 'done', generic: 0, verifiedFix: 0.39,
    hyps: [
      h('Gradient checkpointing on the encoder blocks',
        'Encoder activations dominate the peak and can be recomputed in the backward pass.',
        ['Checkpoint every second block'], [['trainer/model/encoder.py', 36, 8]], 'keep', 0.27, 0.26),
      h('Free the activation cache before the optimizer step',
        'Logged activations are held until the end of the step.',
        ['Drop references after loss.backward()'], [['trainer/loop.py', 11, 3]], 'keep', 0.12, 0.11),
      h('Train in bf16 end to end',
        'Half precision halves activation memory.',
        ['Autocast the full step'], [['trainer/loop.py', 9, 2]], 'CORRECTNESS', null, null,
        { d: 'The loss curve left the tolerance band after 400 steps.', ev: [['Loss deviation at step 400', '4.8%'], ['Tolerance', '1.0%']], lesson: 'Full bf16 changes the optimisation. Restrict to activations that are not accumulated.' }),
      h('In-place AdamW state update',
        'The optimizer allocates temporaries the size of the parameters.',
        ['Use in-place addcmul / addcdiv'], [['trainer/optim/adamw.py', 24, 19]], 'keep', 0.1, 0.09),
      h('Smaller evaluation batch',
        'Evaluation uses a larger batch than training.',
        ['Lower eval batch from 64 to 16'], [['eval/config.yaml', 1, 1]], 'EVALUATOR', null, null,
        { d: 'The evaluation config is part of the frozen evaluator.', ev: [['Files in manifest', '1 of 1'], ['Guard', 'patch rejected']], lesson: 'Peak must drop in the training step itself.' }),
    ],
    diff: `--- a/trainer/loop.py
+++ b/trainer/loop.py
@@ -88,9 +88,12 @@ def train_step(batch, model, opt):
     out = model(batch.obs, checkpoint_every=2)
     loss = criterion(out, batch.target)
     loss.backward()
-    stats = collect_stats(model.activation_cache)
+    stats = collect_stats(model.activation_cache, detach=True)
+    model.activation_cache.clear()
     opt.step()
-    opt.zero_grad()
+    opt.zero_grad(set_to_none=True)
     return loss.item(), stats`,
  },
  {
    id: 'jsonparse-e402', name: 'JSON ingest parser', repo: 'git.lab.internal/data/ingest', sha: 'b3c0a19',
    goal: 'Raise parse throughput on the event-log corpus. Output must be byte-identical.',
    metric: { label: 'parse throughput', unit: ' MB/s', baseline: 412, dir: 'up', digits: 0 },
    owner: 'priya', node: 'gpu-a100-04', job: 4807730, gpus: 0, cap: 180, clockH: 6, warm: 'done', generic: 0, verifiedFix: 0.62,
    hyps: [
      h('Structural index with SIMD classification',
        'Finding quotes and brackets byte by byte dominates the profile.',
        ['Classify 32 bytes per step with AVX2'], [['ingest/parse/stage1.cc', 188, 40]], 'keep', 0.44, 0.41),
      h('Skip UTF-8 validation for ASCII-only blocks',
        'Most blocks are pure ASCII.', ['Check the high bit per block first'], [['ingest/parse/utf8.cc', 21, 4]], 'keep', 0.13, 0.12),
      h('Memory-map the input instead of buffered reads',
        'Buffered reads copy every byte once.', ['mmap with MADV_SEQUENTIAL'], [['ingest/io/reader.cc', 34, 22]], 'NO_GAIN', 0.008, null,
        { d: 'The page cache already serves the corpus; copying is not the limit.', ev: [['Screening', '+0.8%'], ['Noise band', '±1.4%']], lesson: 'I/O is not the bottleneck for a warm corpus.' }),
      h('Parse numbers with a table-driven fast path',
        'Most numbers are short integers.', ['Fast path for up to 8 digits'], [['ingest/parse/number.cc', 47, 9]], 'keep', 0.06, 0.06),
    ],
    diff: `--- a/ingest/parse/utf8.cc
+++ b/ingest/parse/utf8.cc
@@ -41,6 +41,10 @@ bool validate_block(const uint8_t* p, size_t n) {
+  // ASCII-only block: no continuation bytes to check
+  if ((or_reduce_32(p) & 0x80) == 0) {
+    return true;
+  }
   return validate_utf8_slow(p, n);
 }`,
  },
]

export const GENERIC = [
  h('Hoist invariant work out of the hot loop', 'The profile shows repeated work per iteration that does not depend on the loop variable.',
    ['Move the computation above the loop', 'Add a regression test'], [['src/core/hot.py', 18, 11]], 'keep', 0.08, 0.07),
  h('Cache intermediate results keyed by input shape', 'Identical shapes recur across calls.',
    ['Small LRU keyed by shape and dtype'], [['src/core/cache.py', 44, 2]], 'NO_GAIN', 0.007, null,
    { d: 'Cache hits are rare on the benchmark inputs, so the lookup costs as much as it saves.', ev: [['Screening', '+0.7%'], ['Noise band (5 runs)', '±1.6%'], ['Cache hit rate', '4%']], lesson: 'Inputs vary too much for caching. Drop this direction.' }),
  h('Reuse an arena for hot-path allocations', 'Allocator calls show up in the top five symbols.',
    ['Arena per worker', 'Reset between calls'], [['src/core/alloc.py', 61, 14]], 'keep', 0.12, 0.11),
  h('Loosen the tolerance in the correctness harness', 'A looser tolerance would let faster kernels pass.',
    ['Raise rtol in the harness'], [['eval/harness.py', 2, 2]], 'EVALUATOR', null, null,
    { d: 'The harness belongs to the frozen evaluator. The guard rejected the patch before any run.', ev: [['Files in manifest', '1 of 1'], ['Guard', 'patch rejected']], lesson: 'The evaluator is off limits.' }),
  h('Flat array layout for the main data structure', 'Pointer chasing shows up as cache misses.',
    ['Struct-of-arrays layout'], [['src/core/layout.py', 97, 63]], 'REGRESSION', -0.04, null,
    { d: 'The new layout is slower on the benchmark: the access pattern is row-wise.', ev: [['Screening', '−4.2%'], ['L1 miss rate before → after', '1.9% → 3.4%']], lesson: 'Access is row-wise here; keep the row layout.' }),
  h('Unroll the inner loop by 8', 'The loop body is tiny and loop overhead is visible.',
    ['Manual 8-way unroll with a scalar tail'], [['src/core/hot.py', 39, 7]], 'NOT_REPRODUCED', 0.07, 0.004,
    { d: 'The gain did not survive the isolated re-measurement on the pinned slot.', ev: [['Screening', '+7.0%'], ['Promoted re-measurement', '+0.4%']], lesson: 'Small gains need promotion before they count.' }),
  h('Batch small calls into one vectorised call', 'Many tiny calls pay fixed overhead each.',
    ['Collect and dispatch in batches of 64'], [['src/core/dispatch.py', 52, 16]], 'keep', 0.06, 0.05),
]

export const RUN_SNIPPETS = {
  tools: ['run.status', 'git.diff', 'node.exec nvidia-smi', 'run.resume', 'repair.apply', 'git.commit', 'ask.list'],
  roles: ['planner', 'implementer', 'reviewer', 'agent2'],
}
