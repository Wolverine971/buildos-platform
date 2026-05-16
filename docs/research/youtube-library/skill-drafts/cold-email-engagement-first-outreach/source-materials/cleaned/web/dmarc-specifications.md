---
doc_type: cleaned-source-card
skill: cold-email-engagement-first-outreach
source_kind: web
slug: 'Dmarc Specifications'
title: 'Specifications – dmarc.org'
source_url: 'https://dmarc.org/specifications/'
source_label: 'DMARC specifications'
status: 'acquired; official-current'
cleaned_path: 'docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/dmarc-specifications.md'
raw_artifact_removed: 'web/dmarc-specifications.html'
created: 2026-05-15
visibility: internal
publish: false
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/source-materials/cleaned/web/dmarc-specifications.md
---

# Specifications – dmarc.org

Source URL: <https://dmarc.org/specifications/>

Source type: WEB cleaned source card.

Raw artifact policy: raw HTML snapshot replaced by this cleaned Markdown note.

## Use In Cold Email Architecture

DMARC standards reference.

## Source Notes

- Acquisition status: acquired; official-current.
- Source label: DMARC specifications.

## Cleaned Extract

#### DMARC Technical Specification

- Current Versions: Domain-based Message Authentication, Reporting and Conformance (DMARC) RFC 7489 Interoperability Issues between DMARC and Indirect Email Flows RFC 7960 Experimental DMARC Extension for Public Suffix Domains RFC 9091

- Previous Versions: (Historical Reference Only) Historical record related to the IETF (Starting with the first version contributed by DMARC.org on March 31, 2013) “draft-dmarc-base-00” rev.03 (Published by DMARC.org on January 4, 2013) “draft-dmarc-base-00” rev.02 (Published by DMARC.org on March 30, 2012) “draft-dmarc-base-00” rev.01 (Published by DMARC.org on December 16, 2011)

#### Related Specifications

##### Authenticated Received Chain (ARC), RFC 8617

- The Authenticated Received Chain (ARC) protocol, RFC 8617

- ARC preserves initial authentication results across subsequent intermediaries (“hops”) that modify the message and thus will cause email authentication to fail to verify when the message reaches its destination

- Intended to address situations where indirect mailflows are adversely affected when the sending domain publishes certain DMARC policies.

- Recommended Usage of ARC (last draft -09, published November 2020)

- The arc-spec.org website may have more information.

##### Email Authentication for Internationalized Mail, RFC 8616

- Email Authentication for Internationalized Mail, RFC 8616

- This specification updates the SPF, DKIM, and DMARC specifications to clarify which form of internationalized domain names to use in those specifications.

##### Message Header Field for Indicating Message Authentication Status, RFC 8601

- Message Header Field for Indicating Message Authentication Status, RFC 8601

- This document specifies a message header field called “Authentication-Results” for use with electronic mail messages to indicate the results of message authentication efforts.

##### Authentication Failure Reporting Format (AFRF), RFC 6591

- Authentication Failure Reporting Format (AFRF), RFC 6591

- A new report sub-type extension for the Abuse Report Format (ARF) (see: RFC 5965)

- Allows for relaying of forensic details regarding an authentication failure

- Supports reporting of SPF and/or DKIM failures

- For SPF, reports the client IP address and the SPF record(s) that were retrieved, producing a “fail” result

- For DKIM, reports the canonicalized header and body that produced a failed signature, allowing forensic analysis by the signer to detect why the failure occurred

- Also supports ADSP reporting of messages that weren’t signed but should have been

- This is the basis for per-message failure reports sent by participating DMARC receivers/verifiers.

- An aggregate reporting format is included in an appendix of the DMARC specification.

##### DomainKeys Identified Mail (DKIM), RFC 6376

- DomainKeys Identified Mail (DKIM), RFC 6376

- DKIM provides a method for validating a domain name identity that is associated with a message through cryptographic authentication.

- DMARC uses DKIM results as one method (SPF being the other) for receivers to check email.

- More Information: DKIM.org

##### Sender Policy Framework (SPF), RFC 7208

- Sender Policy Framework (SPF), RFC 7208

- SPF provides a method for validating the envelope sender domain identity that is associated with a message through path-based authentication.

- DMARC uses SPF results as one method (DKIM being the other) for receivers to check email.

- More Information: OpenSPF.org
