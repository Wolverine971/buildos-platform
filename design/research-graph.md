https://arxiv.org/pdf/2602.04116

Toward Effective Multimodal Graph Foundation Model:
A Divide-and-Conquer Based Approach
Sicheng Liu * 1 Xunkai Li * 1 Daohan Su 1 Ru Zhang 1 Hongchao Qin 1 Ronghua Li 1 Guoren Wang 1
Abstract
Graph Foundation Models (GFMs) have achieved
remarkable success in generalizing across diverse
domains. However, they mainly focus on TextAttributed Graphs (TAGs), leaving MultimodalAttributed Graphs (MAGs) largely untapped. Developing Multimodal Graph Foundation Models
(MGFMs) allows for leveraging the rich multimodal information in MAGs, and extends applicability to broader types of downstream tasks.
While recent MGFMs integrate diverse modality
information, our empirical investigation reveals
two fundamental limitations of existing MGFMs:
❶ they fail to explicitly model modality interaction, essential for capturing intricate cross-modal
semantics beyond simple aggregation, and ❷ they
exhibit sub-optimal modality alignment, which
is critical for bridging the significant semantic
disparity between distinct modal spaces.
To address these challenges, we propose
PLANET (graPh topoLogy-aware modAlity
iNteraction and alignmEnT), a novel framework
employing a Divide-and-Conquer strategy to decouple modality interaction and alignment across
distinct granularities. At the embedding granularity, ❶ Embedding-wise Domain Gating
(EDG) performs local semantic enrichment by
adaptively infusing topology-aware cross-modal
context, achieving modality interaction. At the
node granularity, ❷ Node-wise Discretization
Retrieval (NDR) ensures global modality alignment by constructing a Discretized Semantic Representation Space (DSRS) to bridge modality
gaps. Extensive experiments demonstrate that
PLANET significantly outperforms state-of-theart baselines across diverse graph-centric and multimodal generative tasks.
*Equal contribution 1Department of XXX, University of
YYY, Location, Country. Correspondence to: Ronghua Li
<lironghuabit@126.com>.
Preprint. February 5, 2026.
1. Introduction
In recent years, GFMs (Xia et al., 2024; Xia & Huang,
2024) have emerged as a transformative paradigm in graph
representation learning, offering a unified encoding framework capable of generalizing across cross-domain datasets.
However, most existing GFMs are primarily designed for
TAGs (He et al., 2025a; Wang et al., 2024b) or focus on
learning unified graph structures (Yu et al., 2025; Sun et al.,
2025), failing to extend effectively to MAGs (Zhu et al.,
2025a; Yan et al., 2025). This limitation implies significant missed improvements. From a data perspective, MAGs
enriched with diverse modalities offer significantly richer
multimodal semantic information compared to TAGs. From
an application perspective, extending GFMs to MAGs significantly broadens the applicable downstream tasks such as
modality retrieval task (Qu et al., 2021) and graph generative task (Yoon et al., 2023; Fang et al., 2025). To address
this limitation, MGFMs (He et al., 2025b; Fang et al., 2025)
have been introduced to integrate these heterogeneous signals within graph structures, achieve domain and modality
alignment.
To validate the advantages of incorporating multimodal information and the superiority of MGFMs approaches, we
conducted an empirical study shown in Fig. 1(a)&(b). Our
findings yield two key conclusions: ❶ The use of multiple modalities consistently improve model performance. ❷
MGFMs significantly outperform GFMs. UniGraph2 (He
et al., 2025b) consistently achieves state-of-the-art results,
demonstrating the need for specialized architectures for
MAGs. Please refer to Appendix B.1 for detailed implementation.
Although MGFMs such as UniGraph2 have demonstrated a
powerful capacity to learn from diverse multimodal graphs,
they are fundamentally limited by their approach to modality
interaction and alignment. Specifically, UniGraph2 does
not account for the significant semantic disparities between
the latent spaces of different encoders and, crucially, lacks
modality interaction, which is verified to be important in
learning robust feature representations (Zhu et al., 2025a).
Furthermore, UniGraph2 lacks explicit supervisory signals
for modality alignment, rendering the alignment process
inefficient and inadequately constrained.
1
arXiv:2602.04116v1 [cs.LG] 4 Feb 2026
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach Accuracy (%)
MRR
Finetuning Epoch Finetuning Epoch
(a) LP on Amazon-Sports (b) NC on Movies (c) NC on Goodreads-NC (d) NC on RedditS
Figure 1. Empirical study results. (a)&(b) Performance comparison across different modalities and architectures. (c)&(d) Stepwise
enhancement results.
To empirically substantiate these limitations of UniGraph2,
we consider the general architecture of MGFMs, which typically consists of four core components: ❶ Modality-specific
encoding, ❷ Modality Interaction (including Graph Neural Network (GNN) processing), ❸ Modality Alignment,
and ❹ Modality Fusion. As detailed in our ablation studies
(See Fig. 1(c)&(d)), we involve a stepwise enhancement
of the UniGraph2 architecture, progressively endowing it
with capabilities for Modality Interaction (MI) and Modality
Alignment (MA). The results demonstrate that each module provides a positive contribution to the model’s overall
performance. This analysis forms the primary motivation
for our work: to develop dedicated mechanisms for these
two critical modules, tailored to address their challenges
at distinct granularities. Please refer to Appendix B.2 for
detailed implementation of the empirical study.
Motivated by the limitations mentioned above, in this work,
we propose PLANET, a novel framework that utilizes a
Divide-and-Conquer strategy to decouple the complexity
inherent in MGFM design across two distinct granularities. At the embedding granularity, we introduce the ❶
EDG for Modality Interaction. We formulate modality
interaction as a process of local semantic enrichment. This
module employs a domain-specialized gating mechanism to
adaptively extract and infuse topology-aware cross-modal
context, enhancing the model’s comprehension of intricate
inter-modality relationships at the fine-grained embedding
level. At the node granularity, we propose the ❷ NDR
for Modality Alignment. We view modality alignment as
a global semantic consensus problem. By constructing a
Discretized Semantic Representation Space (DSRS), this
module retrieves and anchors heterogeneous signals into a
unified space, explicitly enforcing robust alignment at the
coarse-grained node level.
In summary, our key contributions in PLANET are: (1)
New Perspective. To the best of our knowledge, we are
the first to systematically identify and address the critical
shortcomings of existing MGFMs with respect to lack of
modality interaction and alignment. (2) Novel Approach.
We propose PLANET, a novel framework that introduces a
paradigm of topology-aware modality interaction and modality alignment, offering a valuable reference for future designs in the MGFM domain. (3) SOTA Performance. Extensive experiments demonstrate the superiority of PLANET
across various graph-centric tasks and multimodal generative tasks.
2. Preliminaries
2.1. Notations and Problem Formulation
Consider a MAG denoted as G = (V, E, R), with |V| = N
nodes and |E| = M edges. R denotes the collection of raw
multimodal data associated with the nodes (e.g., raw text descriptions, images). Let M = {m1, m2, . . . , m|Ω|} be the
set of available modalities, where |Ω| denotes the number of
modalities. In this work, we operate under the assumption
that each node v ∈ V possesses complete features across
all modalities in M, ensuring a comprehensive multimodal
context for every entity. The raw data is transformed into feature X(m) ∈ R
N×dm via ϕm, where ϕm denotes the frozen
modality-specific encoders for modality m (e.g., ViT (Dosovitskiy, 2020) for images, BERT (Devlin et al., 2019) for
texts). Consequently, we obtain a feature-transformed graph
G
′ = (V, E, X ), where X = {X(m)}m∈M serves as the
input node features for the subsequent learning process.
Based on G
′
, we aim to learn a unified embedding function
fθ following the standard paradigm: Pre-training stage.
We optimize fθ using self-supervised objectives (e.g., reconstruction tasks and contrastive tasks). Fine-tuning stage.
The pre-trained fθ is adapted with task-specific heads to
support diverse downstream tasks.
2.2. Multimodal Graph Learning
Multimodal Graph Learning (MGL) is the machine learning
technique on multimodal graphs (Peng et al., 2024). MGL
are widely employed across various domains, including biology (Gainza et al., 2020), chemistry (Guan et al., 2021),
knowledge graph (Chen et al., 2022; Zeng et al., 2023),
healthcare applications (Zheng et al., 2022) and recommendation systems (Wei et al., 2019; Tao et al., 2020; Yi et al.,
2022; Zhang et al., 2021). However, these existing models
2
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Multimodal
Attributed
Graph
Modality
Encoding
Modality
Interaction
Modality
Alignment
Modality
Fusion
x L layers
Pre-Training:
Self-supervised tasks
Finetuning:
Node
embedding
Modality
embedding
NC
LP
...
G2Text
G2Image
...
SMR
SR
CMR
...
MoE balance
loss
EDG for Modality Interaction
Expert 1
Expert 2
Expert n ...
Gate
Components
Attention
Mechanism
text
Attention
Mechanism
image
Query.
Query.
Key.
Value.
Key.
Value.
Text
emb
Image
emb
Data preprocessing + Modality-specific encoding
Original
Multimodal
Graph
Text Graph
Image Graph
Modalityspecific
Encoder
Quantized
Text emb
Quantized
Image emb
General Knowledge loss
DSRS: Discretized Semantic
Representation Space
Anchor
Discretization Retrieval
Step 1.1 Find Nearest Vector in DSRS
Step 1.2 Assign Vector
NDR for Modality Alignment
Dec Dec
SMR Loss: CMR Loss: SR Loss: Text modality
Image modality
Node
Center Node
(in k-hop neighbor
subgraphs)
Training
Assign vectors Frozen
... Node Embeddings
(After Modality Fusion)
Token embedding
Quantized embedding
Distance between
vectors
Overall Pipeline
Step 1. The MoE component selectively extracts relevant cross-modal semantics
from the 1-hop neighborhood. Step 2. Topology-aware Attention integrates these signals, using the target modality as Query and MoE outputs as Key/Values.
Step1. All node embeddings are mapped into DSRS. Step2. Computing General Knowledge loss for all assigned token embeddings. These
embeddings are used in Self-supervised tasks and downstream tasks.
Self-Supervised Tasks Legend In Framework
Topology-aware Modality
Interaction
Discretized Modality
Alignment
𝒟𝒟𝓂𝓂𝓂𝓂′ 𝒞𝒞𝒞𝒞
Dec
𝒟𝒟 Dec𝓂𝓂
𝒮𝒮
Dec
𝒟𝒟 Dec𝓂𝓂
𝒮𝒮
ℒs ℒ𝒸𝒸 ℒ𝑡𝑡𝑡𝑡𝑡𝑡𝑡𝑡
Figure 2. Overall architecture of the proposed method: PLANET.
are inherently designed for specific tasks within specific
domains (e.g., user-item link predictions), lacking the generalization capability to transfer effectively to other domains
or downstream tasks.
2.3. Graph Foundation Models
Recently, Graph Foundation Models (GFMs) have gained
significant attention for their robust generalization capabilities (Liu et al., 2025b). Some approaches focused on
capturing universal structural patterns (Chen et al., 2025;
Yu et al., 2025; Sun et al., 2025). The majority of existing
GFMs concentrate on TAGs, which focus on aligning graph
structural representations with the semantic space (Tang
et al., 2024; Chen et al., 2024; Kong et al., 2025; Zhu et al.,
2025b; Li et al., 2024) and unifying diverse downstream
tasks across domains to achieve transferability (Liu et al.,
2024; Huang et al., 2023). However, these GFMs are not
primarily designed for MAGs.
Unlike previous works, UniGraph2 (He et al., 2025b) establishes a MGFM, but fails to effectively address the critical
issues of modality interaction and alignment (see Sec. 1).
Although a new study GraphGPT-O (Fang et al., 2025) attempts to incorporate cross-modal interaction, it employs a
non-topology-aware modality interaction mechanism within
an LLM-based framework restricted to generative tasks,
thereby suffering from prohibitive computational overhead
and limited versatility.
3. Methodology
3.1. Overview
We propose PLANET, a MGFM that uses a Divide-andConquer strategy to decouple modality interaction and
modality alignment (Fig. 2).
Modality Encoding. We use modality-specific encoders
to transform raw multimodal data into feature vectors. Following Hou et al. (2022), we employ a modality masking
strategy to these feature vectors (details in Appendix C.1),
yielding the masked feature vectors X˜ (m)
.
For feature dimension alignment across heterogeneous
modalities, we apply a set of modality-specific MLPs on
X˜ (m)
: H(0,m) = MLPm(X˜ (m)
). Subsequently, to preserve the inherent distribution of each modality, we process
H(0,m)
through independent, modality-specific GNNs (e.g.,
3
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
A plush
teddy bear
toy wearing
red ...
A small
plastic frog,
Children's
puzzle toy ...
A cute and soft
pink plush
rabbit pillow,
suitable for
girls to ...
plush
pillow
Expert 1: focus on category
Expert 2: focus on texture
influence text modality
1 2
3
Multimodal Attributed
Graph
plastic
toy
plush
toy
Node 1
Node 3
Node 2
Image
Image Image
MoE
Message passing
path
Node 1 Node 2
Node 3
Example of MoE-Based Cross-Modal Feature Extraction.
Figure 3. Illustration of expert-driven semantic extraction within
the EDG module. Taking the text modality as the target example,
we observe that the target text modality (in Node 3) correlates with
neighboring images (in Node 1,2) via diverse attributes. Our MoE
module is designed to capture these distinct semantic patterns
through specialized experts, enabling the precise extraction of
effective cross-modal mutual information.
Graph Transformer (Dwivedi & Bresson, 2020)) to obtain
the modality-specific embeddings H(spe,m)
.
Modality Interaction & Modality Alignment. We first
employ the EDG at the embedding granularity to infuse
topology-aware cross-modal context (Sec. 3.2). Subsequently, the NDR operates at the node granularity, anchoring
features into a DSRS for modality alignment. This process yields the aligned modality-level node representations
H(cross,m)
(Sec. 3.3).
Modality Fusion. To integrate modality specificity with
interactive semantics, we first fuse modality embeddings:
H(all,m) = H(spe,m)
|| H(cross,m)
. Specifically, for graphcentric tasks (e.g., node classification), we further concatenate multimodal representations to obtain the final node
embeddings: hi = ∥m∈Mh
(all,m)
i
. The entire model is
optimized via a joint self-supervised objective (Sec. 3.4).
3.2. EDG for Modality Interaction
Following the Divide-and-Conquer strategy, the first challenge is to model modality interaction. We formulate this
as a process of local semantic enrichment at the embedding
granularity. Unlike previous works that aggregate modalities globally (He et al., 2025b), EDG operates within the
layer-wise propagation, allowing each node’s modality embedding to dynamically absorb complementary semantics
from its neighbors before any global alignment is enforced.
MoE-Based Cross-Modal Feature Extraction. Intuitively,
in a MAG, the semantic representation of a node in one
modality (e.g., text) is often correlated with the complementary modalities (e.g., image) of its neighbors and itself. For
example, a textual description may correlate with the texture
and category of objects in images (See Fig. 3). Guided by
this observation, we employ a Mixture-of-Experts (MoE)
module to capture these diverse semantic patterns. Formally,
taking H(0,m)
as input, let h
(ℓ,m)
i
denote the output embedding of node i for modality m at the l-th layer of the EDG
module.
For a neighbor node j and modality m. The effective crossmodal signal e
(ℓ,m)
j
is computed as:
e
(ℓ,m)
j =
X
K
k=1
G

n
(ℓ,m)
j

k
· Ek

n
(ℓ,m)
j

,
where n
(ℓ,m)
j =



m′̸=m
h
(ℓ−1,m′
)
j
,
(1)
and Ek(·) represents the k-th expert network (implemented
as an MLP). Each expert specializes in discerning and extracting specific patterns of effective mutual information
from the neighbor node set. K denotes the total number of
expert. G(·)k is the gating score indicating the relevance of
the k-th expert, computed via a softmax gating network:
G

n
(ℓ,m)
j

k
=
exp 
MLPg(n
(ℓ,m)
j
)k

PK
k′=1 exp 
MLPg(n
(ℓ,m)
j
)k′
, (2)
This ensures that the model dynamically selects experts to
capture the diverse semantic combinations of neighboring
modalities.
Topology-Aware Attention Mechanism. After mutual semantic information extraction, a Graph Transformer (Dwivedi & Bresson, 2020) layer is used to perform
topology-aware attention mechanism:
h
(ℓ,m)
i = GTℓ

q = h
(ℓ−1,m)
i
; K, V = {e
(ℓ,m)
j
}j∈Ni

, (3)
where Ni denotes the set of incoming neighbors for node i
(including node i itself), GTl(·) represents the l-th layer of
standard Graph Transformer. Crucially, distinct from standard cross-modal attention which typically operates within
isolated instances (Radford et al., 2021), our mechanism
explicitly integrates graph structural information into the
cross-modal interaction process by querying the complementary modalities of neighboring nodes. See Appendix C.2 for
the detailed formulations of our attention mechanism.
3.3. NDR for Modality Alignment
While the EDG module significantly enriches semantic representation by extracting and infusing cross-modal context,
we argue that a robust MGFM requires a more explicit constraint to bridge the inherent semantic gap between modalities. We formulate modality alignment here as a global
semantic consensus problem, to address this challenge, we
introduce the NDR module at the node granularity.
4
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Discretization Retrieval. We define Discretized Semantic
Representation Space (DSRS) as S = {s1, . . . , sC } containing C learnable latent vectors, referred to as tokens. Let
h
(L,m)
i
denote the final output representation of node i for
modality m from the EDG module. Each node embedding
is mapped to its nearest DSRS token:
h
(cross,m)
i = sc, where c= argmin
j
∥sj − h
(L,m)
i
∥2, (4)
where ∥ · ∥2 denotes the Euclidean distance. This retrieval
step forces features from different modalities to cluster
around shared semantic space.
Text-Anchored General Knowledge Alignment. Inspired
by Liu et al. (2025a), language offers the most dense semantic information, we propose a General Knowledge Loss that
uses the Text modality (t) as an anchor. We align every other
modality m to the text modality in the DSRS:
Lgen=−
1
N(|Ω|−1)
X
m̸=t
XN
i=1
log
z
(t,m)
i,i
PN
j=1z
(t,m)
i,j
+log
z
(t,m)
i,i
PN
j=1z
(t,m)
j,i !
,
where z
(t,m)
i,j = exp 
sim(h
(cross,t)
i
, h
(cross,m)
j
)/τ
,
(5)
and τ is a temperature parameter. This efficiently pulls the
quantized representations of the same node across modalities together while pushing distinct nodes apart.
VQ Objective. To align the latent distribution of modality
features with the quantized semantic space of DSRS, we
utilize the loss function (Van Den Oord et al., 2017):
LV Q =
1
N
X
N
i=1
X
m∈M

∥sg[h
(cross,m)
i
] − h
(L,m)
i
∥
2
2
+γ∥h
(cross,m)
i − sg[h
(L,m)
i
]∥
2
2

,
(6)
where sg[·] denotes the stop-gradient operator to handle the
non-differentiable quantization, and γ controls the commitment cost.
3.4. Self-Supervised Training
Feature Reconstruction. To ensure robust semantic understanding, we propose a dual reconstruction mechanism.
We minimize the error for recovering the masked input itself (Lself ) to capture modality-specific semantics, while
simultaneously enforcing cross-modal correlations by reconstructing features of complementary modalities:
Ls =
1
|Ω|N
XN
i=1
X
m∈M
∥DSMR
m (h
(all,m)
i
) − x
(m)
i
∥
2
2, (7)
Lc =
PN
i=1
P
m̸=m′ ∥DCMR
mm′ (h
(all,m)
i
)−x
(m′
)
i
∥
2
2
(|Ω|
2 − |Ω|)N
,
(8)
where x
(m)
i
is the original unmasked feature vector output by the modality encoder, DSMR
m is the self modality
reconstruction decoder (MLP), and DCMR
mm′ is the cross
modality reconstruction decoder, both of which are implemented as MLPs. The total feature reconstruction loss is:
Lf eat = Ls + βinterLc.
Structural Reconstruction. To preserve topological information, we employ a link reconstruction task. We use Ltopo
to denote the loss function, which enforces higher similarity
scores for connected edges compared to randomly sampled
negative pairs (details in Appendix C.3).
Total Objective. The final training objective combines all
losses:
L = β1Lfeat + β2Ltopo + β3Lgen + β4LV Q + β5Lload, (9)
where β terms are hyperparameters balancing the contribution of each component, Lload is load balancing loss
introduced in Appendix C.3.
3.5. Theoretical Analysis
3.5.1. WHY EDG CAPTURES SYNERGISTIC SEMANTICS?
Definition 3.1. Synergistic Features. Let G(A)
and G(B)
denote input graphs for modality A and B. It can be decomposed into independent modality-specific unique features
{UA, UB} and synergistic features {SA, SB}. {SA, SB}
satisfies the condition of zero mutual information under independent views, i.e., I(Y ; SA) ≈ 0 and I(Y ; SB) ≈ 0,
but positive interaction information under a joint view, i.e.,
I(Y ; SA, SB) > 0, where Y represents the latent semantic
information related to the data.
Theorem 3.2. Synergy Preservation via EDG. Let
Z
∗
V anilla and Z
∗
EDG denote the optimal representations
learned by a vanilla Multimodal Graph Encoder (e.g.,
MMGCN) and PLANET with the EDG module, respectively.
Under the compression constraint of the Information Bottleneck (Federici et al., 2020; Wu et al., 2020), provided that
the trade-off parameter β is sufficiently small, the information gap between the two representations satisfies:
I(Y ;Z
∗
EDG) − I(Y ;Z
∗
V anilla) ≥ I(Y ; SA, SB | UA, UB) > 0.
(10)
Such a theorem demonstrates that vanilla encoders inevitably discard synergistic features {SA, SB} as noise. In
contrast, EDG explicitly captures them, yielding a strictly
larger information gain (proofs are shown in Appendix D).
3.5.2. HOW NDR ENHANCES ALIGNMENT EFFICIENCY?
Definition 3.3. Push-forward Measure. Let µˆm =
1
N
PN
i=1 δ
x
(m)
i
be the empirical measure of modality m,
where δ is the Dirac measure, N is the number of samples. Given a DSRS S and a quantization function Q(x) =
5
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Table 1. Main results on node classification tasks. We report Accuracy and F1-Macro for each dataset. Best results are highlighted in
bold , the second-best are marked with underline . All baselines are first pre-trained and then fine-tuned.
Method RedditS Movies Grocery Toys Ele-fashion Goodreads-NC
Acc F1-Macro Acc F1-Macro Acc F1-Macro Acc F1-Macro Acc F1-Macro Acc F1-Macro
GCN 92.44±0.62 87.34±1.22 52.26±0.74 42.35±1.23 78.60±0.41 64.90±1.09 77.63±0.72 75.54±0.97 85.33±0.06 68.01±0.23 78.44±0.06 68.12±0.16
MMGCN 90.27±0.34 84.22±0.73 53.41±1.03 41.66±2.03 82.56±0.49 73.83±0.93 80.02±0.64 76.36±1.23 86.59±0.08 68.85±0.35 83.22±0.10 71.28±0.22
MGAT 92.78±0.50 87.27±0.53 53.87±0.50 44.09±1.60 83.74±0.62 74.77±1.11 79.61±0.74 77.09±0.87 84.84±0.08 69.62±0.21 82.91±0.04 71.45±0.11
GRACE 93.01±0.53 88.39±1.12 48.09±0.97 37.18±1.33 70.83±0.81 60.69±1.05 72.82±0.66 69.09±0.63 83.58±0.11 70.09±0.47 74.96±0.06 70.09±0.11
GraphMAE2 92.81±0.44 87.93±0.37 50.08±0.77 38.68±1.63 76.24±0.60 66.74±1.33 75.11±0.52 71.80±0.50 83.32±0.31 65.92±0.59 74.15±0.22 69.20±0.28
RiemannGFM 91.63±0.45 85.20±1.13 52.80±0.43 40.74±1.25 82.62±0.46 74.90±1.55 77.85±0.45 74.84±0.60 87.07±0.20 70.45±1.32 78.13±0.17 70.73±0.24
GFT 93.02±0.37 87.00±2.03 51.33±0.67 28.14±1.82 76.80±2.22 59.11±3.02 79.52±0.58 76.00±0.92 87.14±0.22 70.33±1.24 75.93±0.41 66.18±0.30
SAMGPT 93.11±0.19 87.12±0.64 50.25±0.28 34.21±1.37 76.41±0.54 63.40±0.88 73.81±0.41 67.12±0.73 83.81±0.11 69.73±0.39 74.29±0.11 66.57±0.29
UniGraph2 93.65±0.17 87.91±0.68 53.02±0.53 43.43±1.86 82.10±0.37 73.93±1.37 79.00±0.59 76.02±0.78 87.06±0.18 69.80±0.82 79.06±0.27 68.74±0.36
PLANET 96.62±0.22 92.44±0.43 57.06±0.61 47.49±1.23 85.16±0.88 77.23±0.86 81.22±0.50 77.55±0.75 87.37±0.12 70.74±0.78 84.16±0.07 74.43±0.18
Rel-Improv. ↑ 3.17% ↑ 4.58% ↑ 5.92% ↑ 7.71% ↑ 1.70% ↑ 3.11% ↑ 1.50% ↑ 0.60% ↑ 0.26% ↑ 0.41% ↑ 1.13% ↑ 4.17%
Table 2. Link prediction and few-shot link classification results. We report MRR for link prediction, accuracy for few-shot link
classification tasks.
Method
Link Prediction Few-shot Link Classification
Amazon
-Sports
Amazon
-Cloth
Goodreads
-LP
Amazon-Sports-2Way Amazon-Cloth-2Way
10-shot 5-shot 3-shot 10-shot 5-shot 3-shot
MMGCN 23.44±0.43 17.74±0.38 20.73±0.48 56.66±1.60 53.70±1.20 55.86±2.96 67.27±4.20 68.61±5.38 64.36±4.07
MGAT 21.74±0.96 15.47±0.32 21.82±0.53 57.92±1.80 56.55±2.69 54.92±2.40 68.66±2.94 70.34±3.36 67.05±1.45
GRACE 25.31±0.16 18.27±0.15 19.30±0.27 58.50±1.43 57.94±2.58 56.42±1.36 64.96±1.86 64.94±1.09 62.36±2.75
GraphMAE2 24.54±0.30 18.69±0.21 19.99±0.19 56.05±1.70 54.36±1.65 53.28±3.09 62.33±1.78 61.39±1.71 60.95±1.61
GFM
RiemannGFM 21.92±0.51 19.20±0.44 22.03±0.67 53.68±1.24 53.73±2.03 54.07±1.46 66.20±5.94 62.66±1.75 63.45±4.07
GFT 22.04±0.62 17.63±0.59 20.16±1.21 55.73±3.36 56.86±2.30 56.75±2.63 65.37±4.03 66.66±2.10 63.70±2.84
SAMGPT 24.09±0.22 16.41±0.20 24.91±0.38 60.48±4.25 59.00±3.56 59.41±3.62 74.25±1.75 74.20±1.60 72.61±1.90
MGFM
UniGraph2 27.09±0.13 19.31±0.35 19.44±0.19 65.08±3.17 64.27±2.74 60.83±3.90 73.77±1.91 71.28±4.20 73.44±1.57
PLANET 27.51±0.14 20.25±0.27 27.62±0.25 67.84±1.38 64.36±3.05 62.89±3.99 75.44±2.84 75.22±1.20 74.03±4.12
Rel-Improv. ↑ 1.55% ↑ 4.87% ↑ 10.87% ↑ 4.24% ↑ 0.14% ↑ 3.39% ↑ 1.60% ↑ 1.37% ↑0.80%
arg mine∈S ∥x − e∥2, we define the Push-forward Measure of modality m as νˆm = Q#µˆm =
1
N
PN
i=1 δQ(x
(m)
i
)
.
Theorem 3.4. Efficient Alignment via NDR. Assume the
feature space is bounded. The alignment error between the
empirical distribution of modality m (µˆm) and the anchor
text modality t (µˆt) is bounded by:
W1(ˆµm, µˆt)≤Ex∼µˆm∥x − Q(x)∥2 + Ez∼µˆt ∥z − Q(z)∥2+
W1(ν
∗
m, ν
∗
t ) + O

C
√
N

,
(11)
where W1(·, ·) denotes the 1-Wasserstein distance between
distributions, C represents the DSRS size, and W1(ν
∗
m, ν∗
t
)
represents the intrinsic bias between modalities.
This proves that projecting features into DSRS accelerates
the alignment convergence rate from O(N −1/d) in continuous spaces to O(N −1/2
). Additionally, minimizing LV Q
reduces the quantization error terms in Eq. (11), explicitly
tightening the upper bound to ensure robust alignment.
4. Experiments
To validate the superiority of PLANET, we raise several
questions: Q1: Does PLANET consistently outperform
SOTA baselines across standard graph-centric tasks (i.e.,
node classification and link prediction) under both supervised learning and few-shot learning scenarios? Q2: How do
the proposed EDG and NDR modules contribute to achieving topology-aware modality interaction and robust modality alignment, respectively? Q3: Can PLANET effectively
support downstream generative tasks, thereby demonstrating
the robust generalization capabilities and versatile applicability of a foundation model? Q4: How does PLANET
fare in terms of computational efficiency compared to existing GFMs? The implementation details are introduced in
Appendix E.
4.1. Graph-Centric Tasks
Experimental Settings. To answer Q1, we conduct extensive evaluations on node classification and link prediction
tasks under both supervised learning and few-shot learning scenarios. We compare PLANET with 9 strong baselines, which can be categorized into five distinct groups: (1)
Vanilla GNNs: GCN (Kipf & Welling, 2017). (2) Multimodal Graph Models: Including MMGCN (Wei et al.,
2019) and MGAT (Tao et al., 2020). (3) Self-supervised
Graph Learning Models: Comprising contrastive learning
method, GRACE (Zhu et al., 2020) and generative learning method, GraphMAE2 (Hou et al., 2023). (4) Graph
6
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Table 3. Few-shot node classification results. We report accuracy for node classification tasks.
Method Grocery-5way Ele-fashion-5way Goodreads-NC-5way
10-shot 5-shot 3-shot 10-shot 5-shot 3-shot 10-shot 5-shot 3-shot
MMGCN 53.73±3.51 50.30±3.13 48.13±2.65 60.87±3.08 57.05±2.42 54.37±2.99 56.42±2.84 54.10±2.90 52.93±2.94
MGAT 55.53±2.98 54.07±3.18 50.83±2.88 62.82±2.18 61.10±2.20 60.38±2.57 58.22±3.40 57.05±2.35 53.15±3.09
GRACE 62.22±2.89 59.22±3.50 57.28±4.91 64.72±3.04 59.90±2.73 55.49±4.10 59.20±2.00 61.53±3.14 56.84±4.65
GraphMAE2 58.00±4.26 54.60±3.83 51.90±5.76 63.65±3.48 60.00±3.53 57.35±3.05 49.83±2.60 46.30±2.95 43.20±2.70
GFM
RiemannGFM 67.14±2.02 66.23±2.73 63.63±2.48 61.73±2.90 60.24±3.55 59.13±3.71 60.54±3.92 57.17±3.83 54.29±4.10
GFT 63.12±4.07 64.60±3.54 61.45±2.22 62.28±2.62 61.38±3.41 59.08±3.95 51.62±4.73 50.95±4.35 48.70±4.96
SAMGPT 66.47±10.67 62.33±10.49 52.73±12.69 61.27±10.82 61.13±9.32 54.20±10.78 51.80±8.65 47.00±8.35 42.53±6.79
MGFM
UniGraph2 66.27±3.11 61.25±3.09 60.05±4.13 60.38±2.08 58.73±2.95 53.98±4.07 63.80±4.02 61.55±3.97 59.67±4.23
PLANET 81.93±3.48 79.88±3.27 77.85±4.06 74.85±3.73 72.97±3.55 70.50±4.37 69.18±3.90 67.59±4.68 63.62±4.11
Rel-Improv. ↑ 22.03% ↑ 20.61% ↑ 22.35% ↑ 15.65% ↑ 18.88% ↑ 16.76% ↑ 8.43% ↑ 9.81% ↑ 6.62%
Foundation Models: Including SAMGPT (Yu et al., 2025)
and RiemannGFM (Sun et al., 2025), which focus on learning unified graph structures, and GFT (Wang et al., 2024b),
which targets TAGs. (5) Multimodal Graph Foundation
Models: Specifically UniGraph2 (He et al., 2025b), a novel
baseline explicitly designed for processing MAGs. Please
refer to Appendix E for detailed implementation of baselines.
Supervised Learning. Table 1 and 2 show the results of
node classification and link prediction in supervised learning. The results indicate that PLANET consistently outperforms baselines across all datasets. We attribute this superior
performance to the synergistic collaboration between the
EDG and NDR modules operating at distinct granularities.
By jointly facilitating efficient topology-aware modality interaction and alignment, PLANET ensures the generation
of high-quality node embeddings.
Few-Shot Learning. Tables 2 and 3 present the results for
few-shot node classification and link prediction, respectively.
In these challenging low-resource scenarios, PLANET continues to outperform baselines across all datasets. Most
notably, in few-shot node classification tasks, PLANET
achieves remarkable performance gains (15.68%). These
results underscore the model’s robust learning and generalization capabilities under conditions of severe data scarcity,
providing evidence that our pre-training paradigm effectively enables the model to acquire comprehensive prior
knowledge, which can be efficiently transferred to downstream tasks with minimal supervision.
4.2. Ablation Study
To address Q2, we conduct rigorous ablation studies removing core components of PLANET, as shown in Table 4.
❶ w/o. MoE Component. We remove the MoE mechanism.
Here, neighboring multimodal features are fed directly into
the attention mechanism. The result confirms that the MoE
is essential for extracting effective cross-modal signals before modality interaction. ❷ w/o. MoE + Attention Mechanism. We investigate the impact of topology-aware modality
Table 4. Ablation studies on PLANET key components.
Toys RedditS Ele-fashion Amazon-Sports
EDG for Modality Interaction
w/o. MoE 77.77±0.64 95.19±0.30 85.33±0.27 25.92±0.16
w/o. MoE+AM 76.33±0.54 93.01±0.16 84.52±0.14 24.76±0.13
NDR for Modality Alignment
w/o. DSRS 78.53±0.80 95.12±0.33 85.93±0.18 26.19±0.22
w/o. Lgen 77.85±0.73 94.97±0.31 84.71±0.22 25.38±0.19
PLANET 81.22±0.50 96.62±0.22 87.37±0.12 27.51±0.14
interaction by replacing the entire EDG module with standard, independent Graph Transformers for each modality.
The significant performance degradation validates the effectiveness of explicitly modeling the topology-aware interplay
between modalities. ❸ w/o. DSRS. We remove the DSRS
and the associated Discretization Retrieval, directly applying the General Knowledge Loss (Lgen) to the continuous
embeddings h
(L,m)
i
. The resulting performance drop confirms its critical role in modality alignment by projecting
distinct modalities into a unified semantic space. ❹ w/o.
General Knowledge Loss. We retain the DSRS structure but
disable the text-anchored General Knowledge Loss (Lgen).
Results show that without this signal, the model fails to
effectively bridge the semantic gap between the quantized
tokens of different modalities, leading to suboptimal alignment.
4.3. Multimodal Generative Tasks
Experimental Settings. Leveraging the rich cross-domain
semantic information and universal topological patterns
learned during pre-training, PLANET exhibits strong potential for generative applications. To address Q3, we
conduct evaluations on two distinct tasks: ❶ Graph-toText (G2Text) Generation. This task aims to generate a
comprehensive textual description for a target node, conditioned on the graph structure and multimodal context.
We strictly follow the evaluation settings of MMGL (Yoon
et al., 2023). Specifically, MMGL relies on frozen CLIP
encoders, and we replace these embeddings with the text
7
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
MMGL MMGL-UniGraph2 MMGL-PLANET
(a) BLEU-3 (b) BLEU-4 (c) ROUGE-L (d) CIDEr
Flickr30k Grocery Flickr30k Grocery Flickr30k Grocery Flickr30k Grocery
Figure 4. G2Text generation results. We report BLEU-3, BLEU-4, ROUGE-L, and CIDEr on the Flickr30k and Grocery datasets.
InstructG2I InstructG2I-UniGraph2 InstructG2I-PLANET
CLIP score
DINOv2 score
(a) Goodreaders-NC: History (b) Goodreaders-NC: Children (c) Ele-fashion: Jewelry (d) Ele-fashion: Shoes
Figure 5. G2Image generation results. We report CLIP scores in red and DINOv2 scores in blue across four categories selected from the
Goodreads-NC and Ele-fashion datasets.
and image embeddings generated by PLANET. ❷ Graphto-Image (G2Image) Generation. This task focuses on
synthesizing an image for a target node based on a text
prompt and neighbor image context. Adopting the framework of InstructG2I (Jin et al., 2024), we replace the image
features extracted by the pre-trained CLIP image encoder
with the topology-enriched image embeddings produced
by PLANET. Implementation details are provided in Appendix E.3.
Results. Fig. 4 and 5 shows the results of G2Text and
G2Image tasks, respectively. PLANET consistently outperforms baselines across all metrics. We attribute this to
our Divide-and-Conquer strategy, which produces superior
embeddings through modality interaction and alignment.
4.4. Computational Efficiency Analysis
To answer Q4, we conducted an efficiency analysis on the
large-scale Goodreads-NC dataset. We evaluated the total pre-training and fine-tuning time of various baselines.
For task-specific models (i.e., GAT, MMGCN, MGAT), we
record their End-to-End (E2E) training time. Additionally, we monitor the GPU memory usage across different
stages. Results (Fig. 6) demonstrate that PLANET achieves
a superior efficiency-performance trade-off, validating the
scalability of our Divide-and-Conquer design. PLANET
utilizes sufficient memory for pre-training, its fine-tuning
memory usage is minimal since only the linear classifier
is trained. This indicates that our model enables resourceefficient adaptation for downstream tasks.
Pre-training
Fine-tuning / E2E
Memory Usage (MB)
(a) Total Time Consumption (b) Memory Usage
Acc (%)
Time (h)
MMGCN
 0.5h MGAT
0.6h
PLANET
4.5h
UniGraph2
1.7h
RiemannGFM
29.9h
GFT
SAMGPT 9.0h
4.0h
GAT
0.3h
Figure 6. Efficiency comparison between models on GoodreadsNC. (a) Total time consumption. (b) GPU memory usage during
different stages.
5. Conclusion
In this work, we propose PLANET to resolve the critical limitations of existing MGFMs in modality interaction
and alignment. Leveraging a Divide-and-Conquer strategy, the EDG module couples expert-driven extraction with
topology-aware attention to facilitate modality interaction at
embedding level, and the NDR module bridges the semantic
gap by mapping multimodal representations into a unified
Discretized Semantic Representation Space at node level.
Theoretical analysis and extensive experiments confirm the
superiority of PLANET, which achieves state-of-the-art performance across diverse graph-centric and multimodal generative tasks, establishing a robust and scalable framework
for learning on MAGs. In future work, we aim to extend
PLANET to incorporate richer modalities like audio and
video, broadening the applicability of MGFMs in web-scale
scenarios.
8
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Impact Statement
This paper presents work whose goal is to advance the field
of Machine Learning. There are many potential societal
consequences of our work, none of which we feel must be
specifically highlighted here.
References
Ba, J. L., Kiros, J. R., and Hinton, G. E. Layer normalization.
arXiv preprint arXiv:1607.06450, 2016.
Chen, J., Zuo, H., Wang, H. P., Miao, S., Li, P., and Ying,
R. Towards a universal graph structural encoder. arXiv
preprint arXiv:2504.10917, 2025.
Chen, R., Zhao, T., Jaiswal, A., Shah, N., and Wang, Z.
Llaga: Large language and graph assistant. arXiv preprint
arXiv:2402.08170, 2024.
Chen, X., Zhang, N., Li, L., Deng, S., Tan, C., Xu, C.,
Huang, F., Si, L., and Chen, H. Hybrid transformer
with multi-level fusion for multimodal knowledge graph
completion. In Proceedings of the 45th international
ACM SIGIR conference on research and development
in information retrieval, pp. 904–915, 2022.
Devlin, J., Chang, M.-W., Lee, K., and Toutanova, K.
Bert: Pre-training of deep bidirectional transformers
for language understanding. In Proceedings of the
2019 conference of the North American chapter of
the association for computational linguistics: human
language technologies, volume 1 (long and short papers),
pp. 4171–4186, 2019.
Dosovitskiy, A. An image is worth 16x16 words: Transformers for image recognition at scale. arXiv preprint
arXiv:2010.11929, 2020.
Dwivedi, V. P. and Bresson, X. A generalization
of transformer networks to graphs. arXiv preprint
arXiv:2012.09699, 2020.
Fang, Y., Jin, B., Shen, J., Ding, S., Tan, Q., and Han, J.
Graphgpt-o: Synergistic multimodal comprehension and
generation on graphs. In Proceedings of the Computer
Vision and Pattern Recognition Conference, pp. 19467–
19476, 2025.
Federici, M., Dutta, A., Forre, P., Kushman, N., and Akata, ´
Z. Learning robust representations via multi-view information bottleneck. arXiv preprint arXiv:2002.07017,
2020.
Fedus, W., Zoph, B., and Shazeer, N. Switch transformers:
Scaling to trillion parameter models with simple and efficient sparsity. Journal of Machine Learning Research,
23(120):1–39, 2022.
Gainza, P., Sverrisson, F., Monti, F., Rodola, E., Boscaini,
D., Bronstein, M. M., and Correia, B. E. Deciphering
interaction fingerprints from protein molecular surfaces
using geometric deep learning. Nature methods, 17(2):
184–192, 2020.
Guan, Y., Coley, C. W., Wu, H., Ranasinghe, D., Heid, E.,
Struble, T. J., Pattanaik, L., Green, W. H., and Jensen,
K. F. Regio-selectivity prediction with a machine-learned
reaction representation and on-the-fly quantum mechanical descriptors. Chemical science, 12(6):2198–2208,
2021.
He, Y., Sui, Y., He, X., and Hooi, B. Unigraph: Learning a unified cross-domain foundation model for textattributed graphs. Proceedings of the ACM SIGKDD
Conference on Knowledge Discovery and Data Mining,
KDD, 2025a.
He, Y., Sui, Y., He, X., Liu, Y., Sun, Y., and Hooi, B. Unigraph2: Learning a unified embedding space to bind
multimodal graphs. In Proceedings of the ACM on Web
Conference, WWW, 2025b.
Hou, Z., Liu, X., Cen, Y., Dong, Y., Yang, H., Wang, C.,
and Tang, J. Graphmae: Self-supervised masked graph
autoencoders. In Proceedings of the 28th ACM SIGKDD
conference on knowledge discovery and data mining, pp.
594–604, 2022.
Hou, Z., He, Y., Cen, Y., Liu, X., Dong, Y., Kharlamov, E.,
and Tang, J. Graphmae2: A decoding-enhanced masked
self-supervised graph learner. In Proceedings of the ACM
web conference 2023, pp. 737–746, 2023.
Huang, Q., Ren, H., Chen, P., Krzmanc, G., Zeng, D., Liang, ˇ
P. S., and Leskovec, J. Prodigy: Enabling in-context
learning over graphs. Advances in Neural Information
Processing Systems, 36:16302–16317, 2023.
Jin, B., Pang, Z., Guo, B., Wang, Y.-X., You, J., and
Han, J. Instructg2i: Synthesizing images from multimodal attributed graphs. Advances in Neural Information
Processing Systems, 37:117614–117635, 2024.
Kipf, T. N. and Welling, M. Semi-supervised classification with graph convolutional networks. In International
Conference on Learning Representations, ICLR, 2017.
Kong, L., Feng, J., Liu, H., Huang, C., Huang, J., Chen, Y.,
and Zhang, M. Gofa: A generative one-for-all model for
joint graph language modeling. International Conference
on Learning Representations, ICLR, 2025.
Li, Y., Wang, P., Li, Z., Yu, J. X., and Li, J. Zerog: Investigating cross-dataset zero-shot transferability in graphs. In
Proceedings of the 30th ACM SIGKDD Conference on
Knowledge Discovery and Data Mining, pp. 1725–1735,
2024.
9
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Liu, F., Li, Z., Yin, Q., Huang, J., Luo, J., Thakur, A., Branson, K., Schwab, P., Yin, B., Wu, X., et al. A multimodal
multidomain multilingual medical foundation model for
zero shot clinical diagnosis. npj Digital Medicine, 8(1):
86, 2025a.
Liu, H., Feng, J., Kong, L., Liang, N., Tao, D., Chen, Y., and
Zhang, M. One for all: Towards training one graph model
for all classification tasks. International Conference on
Learning Representations, ICLR, 2024.
Liu, J., Yang, C., Lu, Z., Chen, J., Li, Y., Zhang, M., Bai,
T., Fang, Y., Sun, L., Yu, P. S., et al. Graph foundation models: Concepts, opportunities and challenges.
IEEE Transactions on Pattern Analysis and Machine
Intelligence, 2025b.
Peng, C., He, J., and Xia, F. Learning on multimodal graphs:
A survey. arXiv preprint arXiv:2402.05322, 2024.
Qu, L., Liu, M., Wu, J., Gao, Z., and Nie, L. Dynamic modality interaction modeling for image-text retrieval. In Proceedings of the 44th International ACM
SIGIR Conference on Research and Development in
Information Retrieval, pp. 1104–1113, 2021.
Radford, A., Kim, J. W., Hallacy, C., Ramesh, A., Goh, G.,
Agarwal, S., Sastry, G., Askell, A., Mishkin, P., Clark,
J., et al. Learning transferable visual models from natural language supervision. In International conference on
machine learning, pp. 8748–8763. PmLR, 2021.
Sun, L., Huang, Z., Zhou, S., Wan, Q., Peng, H., and Yu, P.
Riemanngfm: Learning a graph foundation model from
riemannian geometry. In Proceedings of the ACM on
Web Conference, WWW, 2025.
Tang, J., Yang, Y., Wei, W., Shi, L., Su, L., Cheng, S.,
Yin, D., and Huang, C. Graphgpt: Graph instruction
tuning for large language models. In Proceedings of the
47th International ACM SIGIR Conference on Research
and Development in Information Retrieval, pp. 491–500,
2024.
Tao, Z., Wei, Y., Wang, X., He, X., Huang, X., and Chua,
T.-S. Mgat: Multimodal graph attention network for recommendation. Information Processing & Management,
57(5):102277, 2020.
Van Den Oord, A., Vinyals, O., et al. Neural discrete
representation learning. Advances in neural information
processing systems, NeurIPS, 30, 2017.
Villani, C. et al. Optimal transport: old and new, volume
338. Springer, 2008.
Wang, P., Bai, S., Tan, S., Wang, S., Fan, Z., Bai, J., Chen,
K., Liu, X., Wang, J., Ge, W., et al. Qwen2-vl: Enhancing
vision-language model’s perception of the world at any
resolution. arXiv preprint arXiv:2409.12191, 2024a.
Wang, Z., Zhang, Z., Chawla, N., Zhang, C., and Ye, Y.
Gft: Graph foundation model with transferable tree vocabulary. Advances in Neural Information Processing
Systems, NeurIPS, 2024b.
Weed, J. and Bach, F. Sharp asymptotic and finite-sample
rates of convergence of empirical measures in wasserstein
distance. Bernoulli, 25(4A):2620–2648, 2019.
Wei, Y., Wang, X., Nie, L., He, X., Hong, R., and Chua,
T.-S. Mmgcn: Multi-modal graph convolution network
for personalized recommendation of micro-video. In
Proceedings of the 27th ACM international conference
on multimedia, pp. 1437–1445, 2019.
Wu, T., Ren, H., Li, P., and Leskovec, J. Graph information
bottleneck. Advances in Neural Information Processing
Systems, 33:20437–20448, 2020.
Xia, L. and Huang, C. Anygraph: Graph foundation model
in the wild. arXiv preprint arXiv:2408.10700, 2024.
Xia, L., Kao, B., and Huang, C. Opengraph: Towards open
graph foundation models. In Findings of the Association
for Computational Linguistics: EMNLP 2024, 2024.
Yan, H., Li, C., Yin, J., Yu, Z., Han, W., Li, M., Zeng,
Z., Sun, H., and Wang, S. When graph meets multimodal: benchmarking and meditating on multimodal
attributed graph learning. In Proceedings of the 31st
ACM SIGKDD Conference on Knowledge Discovery
and Data Mining V. 2, pp. 5842–5853, 2025.
Yi, Z., Wang, X., Ounis, I., and Macdonald, C. Multimodal graph contrastive learning for micro-video recommendation. In Proceedings of the 45th international
ACM SIGIR conference on research and development in
information retrieval, pp. 1807–1811, 2022.
Yoon, M., Koh, J. Y., Hooi, B., and Salakhutdinov, R. Multimodal graph learning for generative tasks. arXiv preprint
arXiv:2310.07478, 2023.
Yu, X., Gong, Z., Zhou, C., Fang, Y., and Zhang, H. Samgpt:
Text-free graph foundation model for multi-domain pretraining and cross-domain adaptation. In Proceedings of
the ACM on Web Conference, WWW, 2025.
Zeng, Y., Jin, Q., Bao, T., and Li, W. Multi-modal
knowledge hypergraph for diverse image retrieval.
In Proceedings of the AAAI conference on artificial
intelligence, volume 37, pp. 3376–3383, 2023.
Zhang, J., Zhu, Y., Liu, Q., Wu, S., Wang, S., and Wang,
L. Mining latent structures for multimedia recommendation. In Proceedings of the 29th ACM international
conference on multimedia, pp. 3872–3880, 2021.
10
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Zheng, S., Zhu, Z., Liu, Z., Guo, Z., Liu, Y., Yang, Y.,
and Zhao, Y. Multi-modal graph learning for disease
prediction. IEEE Transactions on Medical Imaging, 41
(9):2207–2216, 2022.
Zhu, J., Zhou, Y., Qian, S., He, Z., Zhao, T., Shah,
N., and Koutra, D. Mosaic of modalities: A comprehensive benchmark for multimodal graph learning.
In Proceedings of the Computer Vision and Pattern
Recognition Conference, pp. 14215–14224, 2025a.
Zhu, Y., Xu, Y., Yu, F., Liu, Q., Wu, S., and Wang, L. Deep
graph contrastive representation learning. arXiv preprint
arXiv:2006.04131, 2020.
Zhu, Y., Shi, H., Wang, X., Liu, Y., Wang, Y., Peng, B.,
Hong, C., and Tang, S. Graphclip: Enhancing transferability in graph foundation models for text-attributed
graphs. In Proceedings of the ACM on Web Conference,
WWW, 2025b.
11
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Table 5. Statistics of MAG datasets.
Domain Dataset Avg. #Nodes Avg. #Edges #Graphs Task #Classes #Pretrain Weights
E-commerce
Network
Movies 16,672 218,390 1 NC 20 5.0
Toys 20,695 126,886 1 NC 18 5.0
Grocery 17,074 171,340 1 NC 20 5.0
Amazon-Sports 50,250 356,202 1 LP – 1.0
Amazon-Cloth 125,839 951,271 1 LP – 1.0
Ele-fashion 97,766 199,602 1 NC 12 1.0
Social Network Reddit-S 15,894 566,160 1 NC 20 10.0
Flickr30k 31,783 181,551 1 – – 0.0
Knowledge Graph MM-CoDEx-s 1,383 15,884 1 KGC – 20.0
MM-CoDEx-m 7,697 52,840 1 KGC – 20.0
Books Network Goodreads-NC 685,294 7,235,048 1 NC 11 0.5
Goodreads-LP 636,502 3,437,017 1 LP – 0.5
A. Datasets
Dataset. Detailed information of each dataset is presented in Table 5.
• MAGB Datasets. We select four representative graphs from the MAGB benchmark (Yan et al., 2025). Movies, Toys
and Grocery are e-commerce networks constructed from Amazon. Nodes represent products, and edges indicate
also-bought or also-viewed co-purchasing relationships. Each node is associated with a product description and a
product image. Reddit-S is a social network graph derived from the Reddit platform. Nodes represent user posts
containing both text and images. Edges connect posts commented on by the same user, reflecting shared user interests.
• MM-GRAPH Datasets. We incorporate seven datasets from the MM-GRAPH benchmark (Zhu et al., 2025a).
Amazon-Sports, Amazon-Cloth and Ele-fashion are e-commerce networks where nodes represent items associated
with product titles and images. Goodreads-NC and Goodreads-LP are books networks enriched with cover and
descriptions. Edges represent user co-interactions, linking books read or liked by the same users. MM-CoDEx-s and
MM-CoDEx-m are knowledge graphs where entities contain Wikipedia texts and images. Edges denote semantic
relations (e.g., born in) between entities.
• Flickr30k. Flickr30k is a social network. Notably, Flickr30k lacks an intrinsic graph structure. To adapt it for graph
learning, we construct a k-NN graph, where edges are established between nodes with high feature similarity to capture
latent semantic correlations. Nodes represent images associated with five descriptions.
Dataset Split. For the MAGB datasets and Flickr30k, each dataset is randomly partitioned into training sets (60%),
validation sets (20%) and testing sets (20%). For the MM-GRAPH datasets, we strictly adhere to the official data splits
provided in the original benchmark (Zhu et al., 2025a).
B. Detailed Implementation of Empirical Study
B.1. Detailed Implementation of Empirical Study 1
The first empirical study(Fig. 1(a)&(b)) is designed to validate the benefits of incorporating multimodal information and the
superiority of MGFMs approaches. we conducted a comparative study involving both traditional MGL models (MMGCN,
MGAT), Graph Foundation Models (RiemannGFM, SAMGPT) and Multimodal Graph Foundation Models (UniGraph2).
Input Modality Settings. We standardized the feature dimensions and encoding processes across all settings. Specifically,
both text data and image data are encoded through Qwen2-VL-7B-Instruct (Wang et al., 2024a). The output features are
in a fixed dimension of 3,584. For Text or Image settings, These settings represent single-modality scenarios. we adopted
a duplication strategy to ensure compatibility with model architectures which need dual modality inputs. For instance,
in the Text setting, we utilize the text embeddings as the primary input and duplicate them to serve as the input for the
12
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
second modality (i.e., replacing the image features with text features). For the Text+Image setting, we provide models with
comprehensive multimodal information (i.e., text embeddings and image embeddings).
Model Adaptation. For models inherently designed to handle MAGs, including MMGCN, MGAT, and UniGraph2, we
retain their original architectures without modification. For GFMs that are not naturally designed to process MAGs, including
RiemannGFM and SAMGPT, we concatenated the embeddings from the distinct modalities (e.g., for the Text+Image setting,
we concatenated the text and image embeddings) to form a unified node feature embedding.
Results Analysis. As shown in Fig. 1(a)&(b), the Text+Image setting consistently outperforms single-modality baselines,
corresponding to the conclusion: ❶ The use of multiple modalities consistently improve model performance. Comparing
UniGraph2 with RiemannGFM and SAMGPT, UniGraph2 significantly outperforms general GFMs on both dataset across
all settings, corresponding to the conclusion: ❷ MGFMs significantly outperform GFMs.
B.2. Detailed Implementation of Empirical Study 2
This empirical study (Fig. 1(c)&(d)) is designed to validate the limitations of recent MGFMs, exemplified by the state-ofthe-art UniGraph2.
Modality Interaction (MI). The original UniGraph2 employs an “early fusion” strategy, where embeddings from different
modalities are aggregated via weighted sum before entering graph encoder. To realize MI, we removed the early fusion
mechanism and introduced a naive layer-wise interaction strategy. Specifically, in each Graph Encoder layer , we allow
information to flow from one modality m′
to another modality m via a linear projection:
h
(ℓ,m) = GNNLayer(l)
m

h
(ℓ−1,m)

+
α
|Ω| − 1
X
m′̸=m
W(l)
m′m · GNNLayer(l)
m′

h
(ℓ−1,m′
)

(12)
where W(l)
m′m is a learnable projection matrix in layer l, capturing the relationship between modalities m′
and m. α is a
hyperparameter.
MI+Modality Alignment (MA). Building upon the MI, we incorporated the Symmetric InfoNCE Loss (Radford et al.,
2021) to enforce explicit modality alignment. This contrastive objective pulls representations of the same node across
different modalities closer in the latent space.
C. Detailed Formulations
C.1. Modality Masking
Inspired by Hou et al. (2022), we employ a modality masking strategy. Formally, for each node vi ∈ V˜ and modality m ∈ Ω,
we have:
x˜
(m)
i = x
(m)
i ⊙ b
(m)
i
, (13)
where b
(m)
i ∈ {0, 1}
dm is a binary mask vector sampled from a Bernoulli distribution, V ⊂ V ˜ is a sampled subset of nodes,
and ⊙ denotes the element-wise product. This process encourages the model to recover missing feature dimensions using
contextual information from the graph and other modalities.
C.2. Topology-Aware Attention Mechanism
In Sec. 3.2, we abstract the topology-aware attention mechanism as a generic operator GTl(·). Here, we provide its detailed
mathematical formulation. We strictly follow the implementation of Graph Transformer (Dwivedi & Bresson, 2020), but
change the query,key and value vectors. The output of the multi-head attention is computed as:
hˆ
(ℓ,m)
i = O(ℓ,m)
H



k=1


X
j∈Ni
α
(ℓ,m)
ij,k V
(ℓ,m)
k
e
(ℓ,m)
j

 , (14)
where H represents the number of heads. ∥ denotes the concatenation operation, Ni denotes the set of incoming neighbors
for node i, and O(ℓ,m)
is the output projection matrix. For the k-th head, V
(ℓ,m)
k maps the expert-distilled neighbor
signal e
(ℓ,m)
j
to the value vector. The attention coefficient α
(ℓ,m)
ij,k determines the importance of neighbor j’s cross-modal
13
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
information to node i:
α
(ℓ,m)
ij,k = softmaxj



Q
(ℓ,m)
k h
(ℓ−1,m)
i
⊤ 
K
(ℓ,m)
k
e
(ℓ,m)
j

√
dk

 , (15)
where dk is the dimension of each head. The projection matrices Q
(ℓ,m)
k
, K
(ℓ,m)
k
transform the input features into query and
key vectors, respectively. After that, a residual connection followed by Layer Normalization (Ba et al., 2016) is applied to
the output of the attention mechanism:
ˆ
hˆ
(ℓ,m)
i = LayerNorm 
h
(ℓ−1,m)
i + hˆ
(ℓ,m)
i

. (16)
The normalized representation is then passed through a Feed-Forward Network (FNN):
ˆˆ
hˆ
(ℓ,m)
i = MLP2
ℓ

ReLU 
MLP1
ℓ

ˆ
hˆ
(ℓ,m)
i
 . (17)
Finally, a second residual connection and Layer Normalization are applied to produce the final node embedding for layer l:
h
(ℓ,m)
i = LayerNorm 
ˆ
hˆ
(ℓ,m)
i +
ˆˆ
hˆ
(ℓ,m)
i

. (18)
C.3. Loss Functions
MoE Load Balancing. To prevent the issue of expert collapse (i.e., a small subset of experts dominates the processing
while others remain idle), we consider the MoE load balancing loss. Adopting the standard formulation proposed by Fedus
et al. (2022):
Lload = K ·
X
K
k=1
Pkfk, (19)
where fk is the fraction of samples assigned to expert k, and Pk denotes the average routing probability for expert k across a
batch.
Structural Reconstruction. To preserve topological information, we minimize the binary cross-entropy loss over observed
edges E (positive samples) and randomly sampled unconnected pairs Eˆ (negative samples):
Ltopo =
X
m∈Ω
"
−
1
|Ω||E|
X
(i,j)∈E
log 
σ

u
(m)
i
⊤
· u
(m)
j
 −
1
|Ω||E| ˆ
X
(i
′
,j′)∈Eˆ
log 
1 − σ

u
(m)
i
′
⊤
· u
(m)
j
′
 #
, (20)
where SRD is a structural projection head, σ is the sigmoid function, and u
(m)
i = DSR
m (h
(all,m)
i
), DSR
m is structural
reconstruction decoder for modality m, which is an MLP.
D. Proof of Theoretical Analysis
D.1. Proof of Theorem 3.2
In this section, we utilize the Information Bottleneck (IB) principle to prove that vanilla Multimodal Graph Encoders (e.g.,
MMGCN) inevitably discard synergistic features, while PLANET’s topology-aware interaction preserves them.
Following the formulation in Graph Information Bottleneck (Wu et al., 2020), the goal of graph representation learning is to
maximize the IB Lagrangian LIB(Z) = I(Y ;Z) − βI(X;Z), where β > 0 controls the compression trade-off.
Vanilla Multimodal Graph Encoder. The Vanilla Multimodal Graph Encoder processes modalities independently. For a
specific modality A, the encoding follows the Markov chain Y ↔ G(A) → ZA. The optimization objective is to maximize
the local IB: LV anilla = I(Y ;ZA) − βI(G(A)
;ZA). To prove that this encoder discards synergistic features, We define
two potential encoding strategies:
• Drop Synergistic Features (DSF): The encoder captures only unique features, i.e., Z
−
A ≈ {UA}.
14
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
• Keep Synergistic Features (KSF): The encoder captures both unique and synergistic features, i.e., Z
+
A ≈ {UA, SA}.
We calculate the Marginal Contribution ∆LV anilla of shifting from Strategy DSF to Strategy KSF, which can be expressed
as ∆LV anilla = ∆IY − β · ∆IG(A) . For ∆IY , we apply the Chain rule of mutual information (Federici et al., 2020):
∆IY = I(Y ;Z
+
A ) − I(Y ;Z
−
A )
= I(Y ;UA, SA) − I(Y ;UA)
= I(Y ;UA) + I(Y ; SA | UA) − I(Y ;UA)
= I(Y ; SA | UA).
(21)
Crucially, under the independent encoding setting, modality B is unobservable. According to Definition 3.1, the synergistic
feature SA contains no information about Y without the presence of SB (i.e., I(Y ; SA | UA) ≈ 0). Therefore, we have
∆IY ≈ 0.
For ∆IG(A) , we similarly apply the Chain rule:
∆IG(A) = I(G
(A)
;Z
+
A ) − I(G
(A)
;Z
−
A )
= I(G
(A)
;UA, SA) − I(G
(A)
;UA)
= I(G
(A)
; SA | UA)
= H(SA | UA) − H(SA | G
(A)
, UA).
(22)
Since SA is intrinsically part of the input G(A)
, we have H(SA | G(A)
, UA) = 0, therefore:
∆IG(A) = H(SA | UA) > 0. (23)
Substituting these results back to the Marginal Contribution ∆LV anilla:
∆LV anilla ≈ 0 − β · H(SA | UA) < 0. (24)
Since the contribution is negative for any β > 0, maximizing the local IB objective necessitates the exclusion of synergistic
features to avoid incurring unnecessary compression costs. Consequently, we have Z
∗
V anilla ≈ {UA, UB}.
PLANET with the EDG Module. The topology-aware interaction mechanism aggregates semantic context from the crossmodal neighborhood. This implies that the encoding process follows a unified Markov chain Y ↔ {G(A)
, G(B)} → ZEDG.
The optimization objective is to maximize the local IB: LEDG = I(Y ;ZEDG) − βI(G(A)
, G(B)
;ZEDG).
Similarly, we contrast two strategies: The first strategy captures only unique features, i.e., Z
−
EDG = {UA, UB}, and the
second strategy additionally captures the synergistic pair, i.e., Z
+
EDG = {UA, UB, SA, SB}. The marginal contribution of
transitioning from the first strategy to the second strategy is formulated as:
∆LEDG = ∆IY − β · ∆I{G(A),G(B)}
. (25)
Applying the chain rule yields ∆I{G(A),G(B)} = H(SA, SB | UA, UB) > 0 and ∆IY = I(Y ; SA, SB | UA, UB). Under
the joint view enabled by the unified Markov chain, the synergistic features become informative. By Definition 3.1, the
interaction information is strictly positive, yielding:
∆IY = I(Y ; SA, SB | UA, UB) ≫ 0. (26)
Consequently, we have ∆LEDG = ∆IY − β · H(SA, SB | UA, UB). Given that the significant synergistic information gain
outweighs the weighted compression cost (i.e., ∆IY > β·∆I{G(A),G(B)}
), ∆LEDG becomes strictly positive. Consequently,
maximizing the joint IB objective necessitates the preservation of these features, leading to Z
∗
EDG ≈ {UA, UB, SA, SB}.
Finally, we quantify the information gap between the two representations:
I(Y ;Z
∗
EDG) − I(Y ;Z
∗
V anilla) ≈ I(Y ;UA, UB, SA, SB) − I(Y ;UA, UB) = I(Y ; SA, SB | UA, UB) > 0. (27)
This theorem demostrates that our EDG module captures a strictly larger amount of relevant information than vanilla
Multimodal Graph Encoders which process MAGs as independent graphs.
15
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
D.2. Proof of Theorem 3.4
To analyze the generalization bound of our alignment strategy, we employ the 1-Wasserstein distance W1(ˆµm, µˆt) as the
metric for distributional discrepancy.
Utilizing the triangle inequality property of the Wasserstein metric, we decompose the total alignment error into three
components:
W1(ˆµm, µˆt) ≤ W1(ˆµm, νˆm) + W1(ˆνm, νˆt) + W1(ˆνt, µˆt). (28)
For W1(ˆµm, νˆm). By the Kantorovich formulation of Optimal Transport (Villani et al., 2008), the Wasserstein distance is
defined as the infimum of transport costs over all valid joint couplings Π(ˆµm, νˆm):
W1(ˆµm, νˆm) = inf
π∈Π(ˆµm,νˆm)
E(x,y)∼π[∥x − y∥2]. (29)
We define π
∗
such that it transports the probability mass 1/N associated with each sample x
(m)
i
directly to its corresponding quantized token Q(x
(m)
i
). Formally, the joint distribution π
∗
is supported exclusively on the set of pairs
{(x
(m)
i
, Q(x
(m)
i
))}
N
i=1. Let C(π) denote the transport cost associated with a coupling π. Under our deterministic coupling
π
∗
, this cost is exactly:
C(π
∗
) = 1
N
X
N
i=1
∥x
(m)
i − Q(x
(m)
i
)∥2 = Ex∼µˆm∥x − Q(x)∥2. (30)
Therefore, we have the inequality:
W1(ˆµm, νˆm) ≤ C(π
∗
) = Ex∼µˆm∥x − Q(x)∥2. (31)
For W1(ˆνt, µˆt). Similarly, due to the symmetry of the Wasserstein metric and the same quantization mechanism applied to
the anchor text modality t, we have the corresponding upper bound:
W1(ˆνt, µˆt) = W1(ˆµt, νˆt) ≤ Ex∼µˆt
∥x − Q(x)∥2. (32)
For W1(ˆνm, νˆt). We denote ν
∗
m and ν
∗
t
as the underlying ground-truth discrete distributions for modality m and the anchor
text modality t, both supported on S. Accordingly, the empirical push-forward measures νˆm and νˆt are viewed as samples
drawn from these corresponding ground-truth distributions. Leveraging the triangle inequality, we have:
W1(ˆνm, νˆt) ≤ W1(ˆνm, ν∗
m) + W1(ν
∗
m, ν∗
t
) + W1(ν
∗
t
, νˆt). (33)
Let δ ∈ (0, 1) be the scale parameter. According to Proposition 1 in Weed & Bach (2019), The 1-Wasserstein distance is
bounded by:
E[W1(ˆνm, ν∗
m)] ≲ δ
k
∗
+
k
X∗
k=1
δ
k−1 X
Qk
i ∈Qk
E

|νˆm(Q
k
i
) − ν
∗
m(Q
k
i
)|

, (34)
where k
∗
is the truncation depth, and Qk
is the partition at scale k.
We simplify the bound by observing three key properties: ① For a sufficiently large truncation depth k
∗
, the partition
resolution exceeds the minimum separation of DSRS vectors, thereby eliminating the truncation error (i.e., δ
k
∗ → 0). ②
The finite support restricts the inner summation P
Qk
i ∈Qk to at most C non-zero terms. ③ The term E[|νˆm(Qk
i
) − ν
∗
m(Qk
i
)|]
corresponds to the mean absolute deviation of empirical frequencies. By Jensen’s inequality and the variance bound of the
binomial distribution, this is strictly bounded by q
1
4N =
1
2
√
N
.
16
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Substituting these properties into Eq. (34):
E[W1(ˆνm, ν∗
m)] ≤
X∞
k=1
δ
k−1 X
Qk
i ∈Qk
E

|νˆm(Q
k
i
) − ν
∗
m(Q
k
i
)|

≤
X∞
k=1
δ
k−1
·


X
C
j=1
1
2
√
N


=
 X∞
k=1
δ
k−1
!
·
C
2
√
N
.
(35)
Since δ ∈ (0, 1), the geometric series converges to a constant Cδ, yielding E[W1(ˆνm, ν∗
m)] ≤ Cδ · √
C
N
= O

√
C
N

. Both
W1(ˆνm, ν∗
m) and W1(ν
∗
t
, νˆt) satisfy this bound, the total discrete alignment error converges at the rate:
E[W1(ˆνm, νˆt)] ≤ E[W1(ˆνm, ν∗
m)] + E[W1(ν
∗
m, ν∗
t
)] + E[W1(ν
∗
t
, νˆt)] ≤ E[W1(ν
∗
m, ν∗
t
)] + O

C
√
N

(36)
Substituting Eq. (32), (36), (31) into Eq. (28), we obtain the final bound:
W1(ˆµm, µˆt) ≤ Ex∼µˆm∥x − Q(x)∥2 + Ez∼µˆt
∥z − Q(z)∥2 + W1(ν
∗
m, ν∗
t
) + O

C
√
N

. (37)
Comparison. Consider the standard case in continuous space R
d
. According to Theorem 1 and Proposition 7 in Weed &
Bach (2019), the convergence rate of Wasserstein estimation is governed by the lower Wasserstein dimension d∗(µ) of the
measure. For continuous feature distributions in high-dimensional spaces (e.g., dense semantic embeddings in R
d
), the
intrinsic dimension d∗(µ) typically equals the ambient dimension d. Consequently, we have:
E[W1(ˆµ, µ)] ≳ N
−1/d
. (38)
Conclusion. Eq. (38) implies that for high-dimensional features, the convergence rate is extremely slow. In contrast,
by leveraging the DSRS where modality alignment is explicitly constrained by the General Knowledge Loss, PLANET
accelerates the convergence rate to O(C/√
N). Simultaneously, Minimizing LV Q in Eq. (6) effectively minimizes the upper
bounds of W1(ˆµm, νˆm) and W1(ˆνt, µˆt), ensuring that continuous features lie close to DSRS. These mechanisms achieve
effective modality alignment.
E. Experiment Settings
E.1. Supervised Learning
Baseline Settings. For supervised models (i.e., GCN, MMGCN, MGAT), we train them directly on downstream datasets
without any pre-training. In contrast, for self-supervised and graph foundation models, we follow the pre-training and
fine-tuning paradigm: models are first pre-trained across various datasets and subsequently fine-tuned on each specific
downstream task.
During the fine-tuning stage, for baselines that do not provide specific methods for node classification or link prediction,
we add an MLP to perform these tasks. Specifically, the input embeddings of MLP are encoded by the pretrained graph
encoder. For node classification, we set the output dimension of the MLP to the number of classes. For link prediction, we
concatenate the embeddings of the target node pair as input to the MLP, where the output dimension is 1, reflecting the score
for predicting the pair as a positive sample.
Feature Encoding. Both raw text and image data are encoded using Qwen2-VL-7B-Instruct (Wang et al., 2024a) to generate
high-quality initial node embeddings. For baselines that are incapable of processing MAGs (e.g., GraphMAE2, GFT), the
embeddings from modality-specific encoders are concatenated along the feature dimension. It is worth noting that while
RiemannGFM and SAMGPT prioritize the learning of topological knowledge, they use node features in specific ways (e.g.,
17
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Table 6. Detailed parameter settings for few-shot node classification and link classification tasks.
Task Parameter Value
Few-shot Node Classification
n train 20
n query 10
n task 10
Few-shot Link Classification
n train 20
n query 40
n task 10
RiemannGFM uses node features in downstream tasks). In our implementation, we replace these node features with the
representations encoded by the modality-specific encoders, which have significantly richer semantic information.
Pre-training Datasets and Sampling Strategy. Self-supervised and foundation models are pre-trained in same weights of
datasets (weights are presented in Table 5). For baselines that are incapable of taking multiple datasets as input or cannot
scale to large-scale graphs, we implement a sampling approach. Specifically, for each node in the graph, we extract its
2-hop neighbor subgraph. We then randomly sample a fixed number of these subgraphs from each dataset according to the
pre-defined weights (Table 5), forming the training batches. This guarantees that all models are pre-trained on an identical
data distribution.
E.2. Few-Shot Learning
Overall Settings. Most of our experimental settings are the same as those in Appendix E.1 (e.g., feature encoding, sampling
strategies.) Following Wang et al. (2024b), we adapt the ”Pre-training and Fine-tuning” paradigm. However, during
the fine-tuning stage, we do not use an MLP as the classification head. Instead, we use a prototype-based method for
classification. The specific values for the parameters used in our experiments are detailed in Table 6.
Few-Shot Node Classification. For an N-way K-shot task, we randomly sample n train samples for each class from
the training set. On the test set, we randomly select N classes and sample K instances per class to serve as prototype
vectors, along with n query instances for evaluation. These N · K samples are used to construct a prototype classifier,
where the embedding of each class is computed by averaging its corresponding K sample embeddings, resulting in N class
embeddings For evaluation, we calculate the cosine similarity between the evaluation vector and each class embedding,
assigning the sample to the class with the highest similarity. The same procedure applies to the validation set. To eliminate
randomness, this sampling process is repeated n task times, with the final result being the average of these runs.
Few-Shot Link Classification. Since the original datasets (i.e., Amazon-Sports, Amazon-Cloth) are designed for link
prediction tasks, we adapt them for link classification tasks. Specifically, we aggregate all positive edges from the training,
validation, and test sets to form positive samples. We simultaneously generate an equivalent number of random negative
edges to serve as negative samples. These negative edges are allocated to the training, validation, and test sets to strictly
match the count of positive edges in each respective set (e.g., a test set containing 500 positive edges is assigned 500 negative
edges). Consequently, we formulate the problem as a balanced 2-way K-shot binary classification task. The subsequent
method follows the Few-shot Node Classification described above.
E.3. Multimodal Generative Tasks
G2Text. We evaluate the performance of G2Text generation on two multimodal datasets:
• Grocery. This is a real-world e-commerce dataset. The objective is to generate a comprehensive product description
for a target node. The input consists of the target node’s product title and the multimodal context (images and texts)
from its neighbors (including target node’s image).
• Flickr30k. Originally an image-text retrieval dataset, we adapt it for graph-based generation by constructing a k-NN
graph based on feature similarity. Each node contains an image and five distinct textual descriptions. For the G2Text
task, we utilize the last four descriptions of the target node and the multimodal information of neighbor nodes to
generate the first description.
18
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Table 7. Specific prompts for Grocery and Flickr30k datasets in G2Text task.
Dataset Prompt
Grocery
### Task: Generate a natural-language description of the product node.
### Input: Title: <item title of the target node >.
### Output Results:
Flickr30k
### Task: Generate a detailed description for the image based on the context.
### Input: Context: <desc 2 >, <desc 3 >, <desc 4 >, <desc 5 >.
### Output Results:
For the specific prompts used for each dataset, please refer to Table 7.
G2Image. We evaluate the G2Image task on two datasets: Goodreads-NC and Ele-fashion. Following the experimental
setting of InstructG2I (Jin et al., 2024), we focus on specific, visually distinct categories to verify whether our embeddings
capture sufficient semantic nuances to drive fine-grained generation. For Goodreads-NC, we select nodes belonging to
the history and children categories for training and testing. For Ele-fashion, we select nodes from the jewelry and shoes
categories. Distinct from the original data partition used in InstructG2I, we adopt a standard randomized partition strategy
for our experiments. Specifically, for each selected category subset, we split the data into a training set (80%) and a testing
set (20%). This ratio ensures that the model is trained on sufficient data while reserving a substantial portion for robust
evaluation.
F. Implementation Notes
Detailed hyper-parameter settings for the pre-training stage are summarized in Table 8. We optimize the entire framework
using AdamW optimizer for 5 epochs.
19
Toward Effective Multimodal Graph Foundation Model: A Divide-and-Conquer Based Approach
Table 8. Detailed hyper-parameter settings for pre-training.
Category Parameter Value
Optimization
learning rate 4e − 5
weight decay 5e − 4
batch size 128
epochs 5
optimizer AdamW
EDG Module
num experts 5
top-k 2
num layers 8
num heads 8
NDR Module
DSRS size 20480
DSRS dim 768
DSRS temperature 0.93
Loss
β1 (feature reconstruction) 0.1
β2 (structure reconstruction) 0.1
β3 (general knowledge) 0.2
β4 (VQ) 0.1
β5 (MoE load balance) 0.01
βinter 0.5
Other Params
hidden dim (d) 768
dropout 0.1
select node mask p 0.6
select modality mask p 0.4
edge mask p 0.15
20