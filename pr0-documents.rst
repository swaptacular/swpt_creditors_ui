+++++++++++++++++++++++++++++++++++++
PR-zero Payment Request Documents
+++++++++++++++++++++++++++++++++++++
:Description: This document specifies the format for PR-zero payment
              request documents.
:Author: Evgeni Pandurksi
:Contact: epandurski@gmail.com
:Date: 2022-09-16
:Version: 1.0
:Copyright: This document has been placed in the public domain.


Overview
========

This document specifies the format for ``PR-zero`` payment request
documents.

**Note:** The key words "MUST", "MUST NOT", "REQUIRED", "SHALL",
"SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
RFC 2119.


Structure of ``PR-zero`` Documents
==================================

PR-zero documents are `UTF-8`_ encoded text documents, which match the
`regular expression`_ specified below. Whitespaces and comments have
been added for readability::

  ^PR0\r?\n                        # header
  (?<crc32>(?:[0-9a-f]{8})?)\r?\n  # optional CRC-32 value
  (?<accountUri>.{0,200})\r?\n     # payee's account
  (?<payeeName>.{0,200})\r?\n      # payee name
  (?<amount>\d{1,20})(?:\r?\n      # requested amount
  (?<deadline>.{0,200})(?:\r?\n                # payment deadline
  (?<payeeReference>.{0,200})(?:\r?\n          # payee reference
  (?<reasonFormat>[0-9A-Za-z.-]{0,8})(?:\r?\n  # reason format
  (?<reason>[\s\S]{0,3000})        # reason for the payment
  )?)?)?)?$


Optional CRC-32 value
---------------------

When reading a ``PR-zero`` document, if the "optional CRC-32 value"
line is not empty, the contained value MUST be compared to the CRC-32
value calculated for the document. If the values differ, the document
MUST be treated as invalid.

The CRC-32 value for the document is calculated as follows:

1. The textual content of the document is `UTF-8`_ encoded.

2. The first two lines of the document (the "header", and the
   "optional CRC-32 value" lines) are removed.

3. The CRC-32 algorithm is executed on the remaining bytes, producing
   a 32-bit number.

4. The produced 32-bit number is formatted as a lowercase hexadecimal
   number, containing exactly 8 characters. If necessary, leading
   zeros are added.


Payee's account
---------------

The "payee's account" line MUST contain a ``swpt`` [#swpt-scheme]_
`URI`_, which uniquely identifies the payee's account.


Payee name
----------

The "payee name" line contains the name of the payee. This MAY be an
empty string.


Requested amount
----------------

The "requested amount" line MUST contain an integer number between
``0`` and ``9223372036854775807``, which represents the requested
amount in raw currency tokens [#smp-raw-tokens]_.


Payment deadline
----------------

The "payment deadline" line MUST contain either an empty string, or
the deadline for the requested payment, formatted as an ISO 8601
timestamp.


Payee reference
---------------

The "payee reference" line contains a short string that the payer
should include in the transfer note for the payment, so that the payee
can match the incoming transfer with the corresponding payment
request. For example, this could be an invoice number.

This MAY be an empty string.


Reason format
-------------

The "reason format" line contains a short string that indicates how
the remaining content (the "reason for the payment") should be
interpreted. This MAY be an empty string.

**Important note:** All standard *transfer note
formats* [#note-formats]_ can be used as "reason format"s as well.

.. [#note-formats] In Swaptacular, every transfer can have a *transfer
  note*. The "transfer note" is a textual message that contains
  information which the sender wants the recipient of the transfer to
  see. In addition to the transfer note, the sender can specify a
  *transfer note format*, which is a short string that indicates how
  the content of the corresponding transfer note should be
  interpreted. The sender of each transfer can choose among a
  multitude of standard *transfer note formats*. Every transfer note
  format (and therefore, every "reason format") is identified by a
  short string — the format's name. All format names match the regular
  expression: `^[0-9A-Za-z.-]{0,8}$`


Reason for the payment
----------------------

The "reason for the payment" field may contain multiple lines, which
explain the reason for the payment. The way this field is interpreted
depends on the specified "reason format" (see above).

This MAY be an empty string.


.. [#swpt-scheme] The ``swpt`` URI scheme is defined in a separate
  document.

.. [#smp-raw-tokens] "Raw currency tokens" are the 64-bit numbers that
  the `Swaptacular Messaging Protocol`_ uses to represent currency
  amounts. Usually, before being shown to the user, these raw numbers
  will be divided by some big number. For example, the raw number
  ``100`` could be shown to the user as "1 USD".


MIME Type
=========

Over HTTP connections, ``PR-zero`` documents MUST be transferred with
``application/vnd.swaptacular.pr0`` `MIME type`_.


Example ``PR-zero`` Document
============================

::

  PR0

  swpt:112233445566778899/998877665544332211
  Payee Name
  1000
  2021-07-30T16:00:00Z
  12d3a45642665544

  This is a description of the reason
  for the payment. It may contain multiple
  lines. Everything until the end of the file
  is considered as part of the description.
   

.. _Swaptacular: https://swaptacular.github.io/overview
.. _regular expression: https://en.wikipedia.org/wiki/Regular_expression
.. _machine-readable document: https://en.wikipedia.org/wiki/Machine-readable_document
.. _UTF-8: https://en.wikipedia.org/wiki/UTF-8
.. _MIME Type: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
.. _cyclic redundancy check: https://en.wikipedia.org/wiki/Cyclic_redundancy_check
.. _Swaptacular Messaging Protocol: https://swaptacular.org/public/docs/protocol.pdf
.. _URI: https://en.wikipedia.org/wiki/Uniform_Resource_Identifier
.. _Internationalized Resource Identifier: https://en.wikipedia.org/wiki/Internationalized_Resource_Identifier
