+++++++++++++++++++++++++++++++++++++
PR-zero Payment Request Documents
+++++++++++++++++++++++++++++++++++++
:Description: Specifies the PR-zero document format for payment
              requests.
:Author: Evgeni Pandurksi
:Contact: epandurski@gmail.com
:Date: 2022-09-16
:Version: 1.0
:Copyright: This document has been placed in the public domain.


Overview
========

This document specifies the ``PR-zero`` document format for payment
requests.

``PR-zero`` is a `machine-readable`_ format for `Swaptacular`_ payment
requests, which has been specifically designed to be very compact, so
that payment requests in this format can be presented as `QR Codes`_,
and scanned by the payer at the point-of-sale.

**Note:** The key words "MUST", "MUST NOT", "REQUIRED", "SHALL",
"SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
RFC 2119.


``PR-zero`` Documents Structure
===============================

``PR-zero`` documents are `UTF-8`_ encoded text documents, which match
the `regular expression`_ specified below. Whitespaces and comments
have been added for readability::

  ^PR0\r?\n                        # PR0 header
  (?<crc32>(?:[0-9a-f]{8})?)\r?\n  # optional CRC-32 value
  (?<accountUri>.{0,200})\r?\n     # payee's account
  (?<payeeName>.{0,200})\r?\n      # payee name
  (?<amount>\d{1,20})(?:\r?\n      # requested amount
  (?<deadline>.{0,200})(?:\r?\n                # payment deadline
  (?<payeeReference>.{0,200})(?:\r?\n          # payee reference
  (?<reasonFormat>[0-9A-Za-z.-]{0,8})(?:\r?\n  # reason format
  (?<reason>[\s\S]{0,3000})        # reason for the payment
  )?)?)?)?$

As can be seen, the basic structure of ``PR-zero`` documents is such
that each line contains different kind of information about the
payment request (a different "data field"), as follows:


Optional CRC-32 value
---------------------

When reading a ``PR-zero`` document, if the "optional CRC-32 value"
line is not empty, the contained value MUST be compared to the CRC-32
(`Cyclic Redundancy Check`_) value calculated for the document. If the
two values differ, the document MUST be treated as invalid.

The CRC-32 value for the document is calculated as follows:

1. The textual content of the document is `UTF-8`_ encoded.

2. The first two lines of the document are removed. That is: the "PR0
   header" line, and the "optional CRC-32 value" line.

3. The CRC-32 algorithm is executed on the remaining bytes, producing
   a 32-bit number.

4. The produced 32-bit number is formatted as a lowercase hexadecimal
   number, which contains exactly 8 characters. If necessary, leading
   zeros are added.


Payee's account
---------------

The "payee's account" line MUST contain an ``swpt`` [#swpt-scheme]_
`URI`_, which uniquely identifies the payee's account.


Payee name
----------

The "payee name" line contains the name of the payee. This MAY be an
empty string.


Requested amount
----------------

The "requested amount" line MUST contain an integer number between
``0`` and ``9223372036854775807`` (|263| - 1), which represents the
requested amount in *raw currency tokens* [#smp-raw-tokens]_.

.. |263| replace:: 2\ :sup:`63`


Payment deadline
----------------

The "payment deadline" line MUST contain either an empty string, or
the deadline for the requested payment, formatted as an `ISO 8601`_
timestamp.


Payee reference
---------------

The "payee reference" line contains a short string that the payer
should include in the transfer note for the payment, so that the payee
can match the incoming transfer with the corresponding payment
request. For example, this could be an invoice number. The payee
reference MAY be an empty string.


Reason format
-------------

The "reason format" line contains a short string that indicates how
the remaining document content (the "reason for the payment" field)
should be interpreted. The reason format MAY be an empty string, which
indicates "plain text".

**Important note:** All standard *transfer note formats* [#note-formats]_
can be used as "reason format"s too. That is: the same format names
correspond to the same formats.


Reason for the payment
----------------------

The "reason for the payment" field may contain multiple lines, which
can be used to describe the reason for the payment. The manner in
which this field will be interpreted depends on the specified "reason
format" (see above).

This MAY be an empty string.


An Example ``PR-zero`` Document
===============================

::

  PR0

  swpt:112233445566778899/998877665544332211
  Payee Name
  1000
  2021-07-30T16:00:00Z
  payee-reference-12345

  This is a description of the reason for the payment. It may
  contain multiple lines. Everything until the end of the file
  will be considered as part of the description.
   

Size of ``PR-zero`` Documents
-----------------------------

Because ``PR-zero`` documents are designed to be presented as `QR
Codes`_, there are severe practical limitations on their size. Also,
for the convenience of the users, some *Currency Holder UI*
implementations will try to include all the available information from
the payment request, in the *transfer note* for the payment. Because
of this, the combined byte-length of the "payee name", "payee
reference", "reason format", and "reason for the payment" fields
SHOULD be at least 50 bytes smaller than the maximum byte-length for
transfer notes.

**Note:** The maximum byte-length for transfer notes may vary from
currency to currency. [#note-max-bytes]_


MIME Type
=========

Over HTTP connections, ``PR-zero`` documents MUST be transferred with
the ``application/vnd.swaptacular.pr0`` `MIME type`_.


.. [#swpt-scheme] The ``swpt`` URI scheme is defined in a separate
  document.

.. [#smp-raw-tokens] "Raw currency tokens" are the 64-bit numbers that
  the `Swaptacular Messaging Protocol`_ uses to represent currency
  amounts. Usually, before being shown to the user, these raw numbers
  will be divided by some (usually big) number. For example, the raw
  number ``2500`` could be shown to the user as "25 USD".

.. [#note-formats] In Swaptacular, every transfer can have a *transfer
  note*. The "transfer note" is a textual message that contains
  information which the sender wants the recipient of the transfer to
  see. In addition to the transfer note, the sender can specify a
  *transfer note format*, which is a short string that indicates how
  the content of the corresponding transfer note should be
  interpreted. The sender of each transfer can choose among a
  multitude of standard *transfer note formats*. Every transfer note
  format is identified by a short string — the format's name.
  Transfer note format names match the regular expression:
  ``^[0-9A-Za-z.-]{0,8}$``

.. [#note-max-bytes] The maximum byte-length for transfer notes in a
  given currency, will be determined by the value of the
  ``transfer_note_max_bytes`` field in `Swaptacular Messaging
  Protocol`_'s ``AccountUpdate`` messages.


.. _Swaptacular: https://swaptacular.github.io/overview
.. _regular expression: https://en.wikipedia.org/wiki/Regular_expression
.. _machine-readable: https://en.wikipedia.org/wiki/Machine-readable_document
.. _UTF-8: https://en.wikipedia.org/wiki/UTF-8
.. _MIME Type: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
.. _Cyclic Redundancy Check: https://en.wikipedia.org/wiki/Cyclic_redundancy_check
.. _Swaptacular Messaging Protocol: https://swaptacular.github.io/public/docs/protocol.pdf
.. _URI: https://en.wikipedia.org/wiki/Uniform_Resource_Identifier
.. _ISO 8601: https://en.wikipedia.org/wiki/ISO_8601
.. _QR codes: https://en.wikipedia.org/wiki/QR_code
