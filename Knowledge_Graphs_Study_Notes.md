<!-- Knowledge_Graphs_Study_Notes.md -->

# Knowledge Graphs — Study Notes

A walkthrough of the RDF / RDFS / OWL stack, written for someone who has _used_ a knowledge graph (compiled queries to SPARQL, traversed it as an analyst tool) but never _designed_ one.

---

## 1. Quick recap of what you already know

- A **triple** is `subject – predicate – object`. Examples:
    - `:Dave  :servedIn  :USMC`
    - `:Doc-42  :mentions  :Person-117`
    - `:Person-117  :hasName  "John Smith"`
- A **graph** is just a set of triples.
- An **ontology** is the schema — what classes (types of things) and predicates (types of relationships) are allowed.
- **Open-world assumption**: if a triple isn't there, that doesn't mean it's false; it means we don't know. (SQL is closed-world: not in the table = doesn't exist.)
- **Triple stores** (Jena, Fuseki, Stardog, GraphDB, Virtuoso, Blazegraph) are the databases that store and query triples via SPARQL.

OK, now the parts you said were fuzzy.

---

## 2. IRIs — global identifiers

### What an IRI actually is

**IRI** = _Internationalized Resource Identifier_. Think of it as a URL that names a thing. It's how you uniquely identify _anything_ in a knowledge graph — a person, a class, a property, a document, a place.

Examples:

```
http://example.org/people/dave-wayne
http://xmlns.com/foaf/0.1/Person
http://schema.org/birthDate
http://dbpedia.org/resource/Afghanistan
```

The IRI doesn't have to _resolve_ to anything (you don't have to be able to fetch it in a browser). It's just a globally unique name. Some of them _do_ resolve, which is nice for documentation, but it's not required.

### Why this matters — the "global" part

In SQL, your primary keys are unique _inside your database_. `users.id = 42` only means something inside your app.

In RDF, identifiers are unique _across the entire web_. That sounds academic but it's the whole point of the model:

- If Curri publishes a graph with `http://curri.com/drivers/d-9001` and DoorDash publishes one with `http://doordash.com/dashers/dx-44`, you can **merge the two graphs into one** without the IDs colliding.
- If two different organizations both use `http://schema.org/Person`, that's the _same class_ in both graphs. They can interoperate without a coordination meeting.
- This is why intel platforms like Dewey love RDF: you ingest data from many sources and the IDs don't fight each other.

### Prefixes — the shorthand you actually see

Nobody writes full IRIs all day. You declare prefixes and use short forms:

```turtle
@prefix foaf:  <http://xmlns.com/foaf/0.1/> .
@prefix dewey: <http://dewey.af.mil/ontology/> .
@prefix :      <http://dewey.af.mil/data/> .

:Person-117  a              foaf:Person ;
             foaf:name      "John Smith" ;
             dewey:linkedTo :Doc-42 .
```

`foaf:Person` is shorthand for `http://xmlns.com/foaf/0.1/Person`. `a` is shorthand for `rdf:type`. `:Person-117` (no prefix name) uses the default `:` prefix.

When you wrote SPARQL at Webworld, you almost certainly opened every query with a `PREFIX` block. Same idea.

### A few special IRIs worth recognizing

| IRI                                         | What it is                              |
| ------------------------------------------- | --------------------------------------- |
| `rdf:type`                                  | "is an instance of" — the type relation |
| `rdfs:subClassOf`                           | class hierarchy                         |
| `rdfs:label`                                | human-readable name                     |
| `owl:Class`, `owl:ObjectProperty`           | OWL's class / property declarations     |
| `xsd:string`, `xsd:integer`, `xsd:dateTime` | XML Schema datatypes for literals       |

---

## 3. The big insight: the schema is also triples

This is the part that makes RDFS and OWL click.

In SQL, the schema is a separate thing — a `CREATE TABLE` statement, stored in catalog tables you don't normally touch.

In RDF, **the schema is just more triples in the same graph**. Saying "Sniper is a subclass of Marine" is itself a triple:

```
:Sniper  rdfs:subClassOf  :Marine .
```

That's the whole trick. RDFS and OWL are just **vocabularies of pre-defined predicates** you use to describe schema. The store doesn't treat schema specially — it's all triples, queryable with the same SPARQL.

This is also why a _reasoner_ (covered below) can derive new triples mechanically: schema + data are in the same format.

---

## 4. RDFS — the basic schema vocabulary

RDFS = _RDF Schema_. It gives you a small set of predicates to declare classes, properties, and hierarchies.

The main moves:

```turtle
# Declare classes
:Marine     a rdfs:Class .
:Sniper     a rdfs:Class .
:Document   a rdfs:Class .

# Class hierarchy
:Sniper     rdfs:subClassOf  :Marine .

# Declare a property
:servedIn   a rdfs:Property .

# Property domain/range — what types it connects
:servedIn   rdfs:domain  :Marine .
:servedIn   rdfs:range   :Branch .

# Instances
:Dave       a :Sniper .
:Dave       :servedIn :USMC .
```

What RDFS gives you:

- **Type hierarchies**: `Sniper subClassOf Marine`. A reasoner can infer `:Dave a :Marine` because `:Dave a :Sniper`.
- **Property hierarchies**: `:bestFriend rdfs:subPropertyOf :friend`.
- **Domain/range**: weak typing for properties — _if you use `:servedIn`, the subject is a Marine and the object is a Branch._

What RDFS _cannot_ express:

- "A person has exactly one date of birth."
- "A class can't be both a Marine and a Civilian."
- "These two classes from different vocabularies are actually the same thing."
- "If A is married to B, then B is married to A."

That's where OWL comes in.

---

## 5. OWL — the expressive constraints layer

**OWL** = _Web Ontology Language_. It's a richer vocabulary built on top of RDFS. Same model — still just triples — but with predicates that let you state much stronger rules.

OWL's predicates fall into four big buckets:

1. **Cardinality** — how many.
2. **Disjointness / equivalence** — relationships between classes (and between properties).
3. **Property characteristics** — symmetric, transitive, inverse, functional.
4. **Restrictions / class expressions** — define classes by the properties they have.

Walk through them.

---

### 5a. Cardinality — _how many of this_

Cardinality constraints say how many values a property may or must have for a given subject.

OWL gives you three flavors:

| Constraint           | Meaning                             |
| -------------------- | ----------------------------------- |
| `owl:minCardinality` | at least N                          |
| `owl:maxCardinality` | at most N                           |
| `owl:cardinality`    | exactly N (shorthand for min = max) |

Example — every Marine must have **at least one** MOS code (Military Occupational Specialty):

```turtle
:Marine  a owl:Class ;
         rdfs:subClassOf [
           a owl:Restriction ;
           owl:onProperty     :hasMOS ;
           owl:minCardinality 1
         ] .
```

Read that as: "A Marine is a class such that anything in it must have at least one `:hasMOS` value." (The blank node `[ … ]` is just an anonymous Restriction class — you'll see this pattern everywhere in OWL.)

A few more:

```turtle
# A Person has exactly one biological mother
:Person  rdfs:subClassOf [
           a owl:Restriction ;
           owl:onProperty   :biologicalMother ;
           owl:cardinality  1
         ] .

# A Document has at most one primary author
:Document  rdfs:subClassOf [
             a owl:Restriction ;
             owl:onProperty     :primaryAuthor ;
             owl:maxCardinality 1
           ] .
```

**What "violation" actually looks like:** because RDF is open-world, _missing_ values don't violate `minCardinality 1`. The reasoner can't conclude "this is broken" — it just assumes the missing fact exists somewhere. But if you assert _two different_ primary authors on a document with `maxCardinality 1`, the reasoner will flag the graph as **inconsistent**, or (more often) infer that the two authors are actually the same individual (`owl:sameAs`), which is sometimes useful and sometimes hilarious.

This is the single weirdest thing about OWL coming from SQL. In SQL, NOT NULL means "scream if missing." In OWL, cardinality means "the reasoner gets to draw conclusions from this."

---

### 5b. Disjointness — _these can't overlap_

`owl:disjointWith` says two classes share no instances.

```turtle
:Person    a owl:Class .
:Document  a owl:Class .

:Person   owl:disjointWith  :Document .
```

Now if your graph contains:

```turtle
:Thing-9  a :Person .
:Thing-9  a :Document .
```

…the reasoner reports the graph as inconsistent. Without `disjointWith`, OWL would happily assume `:Thing-9` is _both_ a person and a document, because the open-world assumption doesn't rule that out by default.

Real-world intel example:

```turtle
:Officer    owl:disjointWith  :Enlisted .
:Confirmed  owl:disjointWith  :Unconfirmed .
:Friendly   owl:disjointWith  :Hostile .
```

You'll also see the more compact `owl:AllDisjointClasses`:

```turtle
[] a owl:AllDisjointClasses ;
   owl:members ( :Person :Document :Place :Event ) .
```

That single statement says all four classes are pairwise disjoint.

---

### 5c. Equivalence — _these are the same thing_

Two flavors, easy to mix up:

**`owl:equivalentClass`** — two classes always have exactly the same instances.

```turtle
:Marine  owl:equivalentClass  usmc:USMarine .
```

If `:Dave a :Marine`, the reasoner infers `:Dave a usmc:USMarine`, and vice versa. This is the magic move when you're merging two vocabularies that describe the same real-world thing under different names.

**`owl:sameAs`** — two _individuals_ (instances) are the same real-world entity.

```turtle
:dewey-person-117       owl:sameAs  dbpedia:John_Smith_(general) .
```

Now any triple about either IRI applies to both. If the Dewey graph has employment history and DBpedia has biography, merging via `sameAs` gives you both views of the same person.

There's also `owl:equivalentProperty` — same idea, for properties:

```turtle
foaf:knows  owl:equivalentProperty  schema:knows .
```

---

### 5d. Property characteristics (the bonus round)

OWL lets you tag a property with logical properties that drive inference. The big ones:

| Characteristic                  | Meaning                                    | Example                             |
| ------------------------------- | ------------------------------------------ | ----------------------------------- |
| `owl:SymmetricProperty`         | If `A p B` then `B p A`                    | `:marriedTo`, `:siblingOf`          |
| `owl:TransitiveProperty`        | If `A p B` and `B p C` then `A p C`        | `:ancestorOf`, `:partOf`            |
| `owl:InverseFunctionalProperty` | The object uniquely identifies the subject | `:hasSSN`, `:hasEmail`              |
| `owl:FunctionalProperty`        | The subject has at most one value          | `:dateOfBirth`, `:biologicalMother` |
| `owl:inverseOf`                 | `p1` is the inverse of `p2`                | `:authoredBy` ↔ `:authorOf`        |

Example — declare and use:

```turtle
:marriedTo    a owl:SymmetricProperty .
:ancestorOf   a owl:TransitiveProperty .
:hasEmail     a owl:InverseFunctionalProperty .

:Alice  :marriedTo  :Bob .
# Reasoner infers:
# :Bob :marriedTo :Alice .

:Grandma  :ancestorOf :Mom .
:Mom      :ancestorOf :Me .
# Reasoner infers:
# :Grandma :ancestorOf :Me .

:Person-A :hasEmail "x@y.com" .
:Person-B :hasEmail "x@y.com" .
# Reasoner infers:
# :Person-A owl:sameAs :Person-B .
```

That last one is the punch — _inverse functional properties are how you do entity resolution declaratively_. Two records sharing an SSN or canonical email get fused.

---

## 6. Reasoners — what actually happens with all this

A **reasoner** (a.k.a. inference engine) is a component of the triple store (or a separate process) that reads your data + ontology and _produces additional triples or contradictions_ by applying RDFS and OWL rules.

Two main jobs:

1. **Entailment** — derive new triples.
    - From `:Dave a :Sniper` + `:Sniper rdfs:subClassOf :Marine`, derive `:Dave a :Marine`.
    - From `:Alice :marriedTo :Bob` + `marriedTo a owl:SymmetricProperty`, derive `:Bob :marriedTo :Alice`.
2. **Consistency checking** — flag the graph as broken.
    - `:Thing-9 a :Person` + `:Thing-9 a :Document` + `:Person owl:disjointWith :Document` → inconsistent.

Two implementation strategies:

- **Forward chaining / materialization**: at ingest time, the reasoner expands the graph by writing all entailed triples to disk. Queries are fast; storage and ingest are heavy.
- **Backward chaining / query-time reasoning**: at query time, the reasoner expands the query to also match entailed patterns. Storage is light; queries are slower.

Most production systems pick a "profile" of OWL — a subset that's tractable to reason over. The common profiles:

- **OWL 2 RL** — rule-based, fits into databases nicely. The most common production choice.
- **OWL 2 EL** — designed for huge biomedical ontologies (SNOMED CT).
- **OWL 2 QL** — designed for query rewriting over relational data.
- **OWL 2 DL** — full expressivity. Decidable but expensive.
- **OWL Full** — anything goes. Undecidable. Don't.

You don't need to memorize the profiles. Just know the answer to "did you use OWL reasoning in production?" is usually "we used a restricted profile (RL is common) so the reasoner didn't blow up."

---

## 7. Putting it all together — a small worked example

Here's a tiny intel-domain ontology fragment using everything above:

```turtle
@prefix : <http://dewey.af.mil/ontology/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .

# Classes
:Person     a owl:Class .
:Document   a owl:Class .
:Event      a owl:Class .
:Officer    a owl:Class ; rdfs:subClassOf :Person .
:Enlisted   a owl:Class ; rdfs:subClassOf :Person .

# These classes can't overlap
:Person   owl:disjointWith :Document .
:Officer  owl:disjointWith :Enlisted .

# Properties
:mentions      a owl:ObjectProperty ;
               rdfs:domain :Document ;
               rdfs:range  :Person .

:authoredBy    a owl:ObjectProperty , owl:FunctionalProperty ;
               rdfs:domain :Document ;
               rdfs:range  :Person .

:knows         a owl:ObjectProperty , owl:SymmetricProperty ;
               rdfs:domain :Person ;
               rdfs:range  :Person .

:hasSSN        a owl:DatatypeProperty , owl:InverseFunctionalProperty ;
               rdfs:domain :Person ;
               rdfs:range  xsd:string .

# A Document must have at least one mentioned person to be considered "intel-relevant"
:IntelRelevantDocument
    a owl:Class ;
    rdfs:subClassOf :Document ;
    rdfs:subClassOf [
      a owl:Restriction ;
      owl:onProperty     :mentions ;
      owl:minCardinality 1
    ] .
```

A few sample data triples:

```turtle
:Doc-42       a :Document ;
              :authoredBy :Person-117 ;
              :mentions   :Person-117, :Person-200 .

:Person-117   a :Officer ;
              :hasSSN "123-45-6789" ;
              :knows :Person-200 .

:Person-200   a :Enlisted ;
              :hasSSN "123-45-6789" .   # ← oops, same SSN
```

What the reasoner does with this:

1. From `Officer rdfs:subClassOf Person`, infer `:Person-117 a :Person` and `:Person-200 a :Person`.
2. From `:knows a owl:SymmetricProperty` + `:Person-117 :knows :Person-200`, infer `:Person-200 :knows :Person-117`.
3. From `Doc-42 :mentions :Person-117, :Person-200` and the IntelRelevantDocument restriction, infer `:Doc-42 a :IntelRelevantDocument`.
4. From `:hasSSN a owl:InverseFunctionalProperty` and both people sharing an SSN, infer `:Person-117 owl:sameAs :Person-200`.
5. But then `:Person-117 a :Officer` and `:Person-200 a :Enlisted`, and Officer/Enlisted are disjoint → **the graph is inconsistent**, the reasoner reports an error.

That's the whole picture: the schema isn't documentation, it's executable logic. The reasoner is the engine that runs it.

---

## 8. What you should be ready to say in an interview

If someone asks "tell me about the ontology you worked with at Webworld," a strong answer that doesn't overclaim:

> "It was an RDF-based knowledge graph designed by a knowledge engineer with intel SMEs — they owned the class and predicate model. From my side as the query-builder author, I worked with the published vocabulary daily: classes for people, places, events, source documents, and predicates like _mentioned-in_ and _co-occurs-with_. My UI compiled an AND/OR expression tree into SPARQL against that vocabulary. I'm comfortable reading and writing SPARQL, including OPTIONAL and property paths, and I understand the RDFS vs OWL distinction at the conceptual level — RDFS for hierarchy and domain/range, OWL for cardinality, disjointness, equivalence, and property characteristics like symmetry and inverse-functional. I haven't designed a production ontology myself; if I did, I'd start by reusing existing vocabularies — FOAF, Dublin Core, PROV — before introducing custom classes."

That's honest, specific, and shows you can talk to a real ontologist without bluffing.

---

## 9. Things to ask follow-up questions about

I deliberately glossed over a few things. Tell me which of these you want me to expand:

- **Blank nodes** — what they really are, when to use them, why they're controversial.
- **Named graphs / quads** — how multiple graphs live in one store, and why provenance loves them.
- **SPARQL deep dive** — `OPTIONAL` semantics, property paths, federated queries with `SERVICE`, `CONSTRUCT` for graph transformation.
- **Ontology design process** — how a knowledge engineer actually builds one with SMEs (competency questions, vocabulary reuse, modeling patterns).
- **RDF vs property graphs (Neo4j)** — when you'd pick one over the other, and what each loses.
- **PROV-O** — the W3C provenance ontology, very relevant to intel use cases.
- **SHACL** — the _other_ constraint language for RDF, often preferred over OWL for data validation.
- **Reasoning in practice** — when teams actually turn it on, when they don't, and why.
