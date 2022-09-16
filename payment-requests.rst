+++++++++++++++++++++++++++++++++++++++++++++
Payment Requests and Transfers in Swaptacular
+++++++++++++++++++++++++++++++++++++++++++++
:Description: Outlines the way payment requests and transfers work in
              Swaptacular
:Author: Evgeni Pandurksi
:Contact: epandurski@gmail.com
:Date: 2022-09-14
:Version: 1.0
:Copyright: This document has been placed in the public domain.


Overview
========

This document outlines the way payment requests and transfers work in
`Swaptacular`_.

**Note:** The key words "MUST", "MUST NOT", "REQUIRED", "SHALL",
"SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
RFC 2119.


Payment Request Documents
-------------------------

A "Payment Request Document", or simply a *payment request*, is a
`machine-readable document`_ that represents a request some amount of
a specified currency, to be transferred to a specified account. A
multitude of standard formats can be used for payment request
documents, which shall be defined in their respective format
specifications.

As an absolute minimum, every payment request MUST contain a
``swpt`` [#swpt-scheme]_ `URI`_ which uniquely identifies **the payee's
account**.

Furthermore, payment requests SHOULD contain:

* *the requested amount*

* *the payee reference*

  The "payee reference" is a short string that the payer should
  include in the `transfer note`_ for the payment (see below), so that
  the payee can match the incoming transfer with the corresponding
  payment request. For example, this could be an invoice number.

Payment requests MAY contain additional information like:

* *the payee name*,

* *the reason for the payment*,

* *the deadline for the payment*,
  
* etc.  
  
.. [#swpt-scheme] The ``swpt`` URI scheme is defined in a separate
  document.
   

Transfer Note
-------------

In Swaptacular, every transfer can have a *transfer note*. [#smp]_ The
"transfer note" is a textual message that contains information which
the sender wants the recipient of the transfer to see.

In addition to the transfer note, the sender can specify a *transfer
note format*, which is a short string that indicates how the content
of the corresponding transfer note should be interpreted.

.. [#smp] This is specified by the `Swaptacular Messaging Protocol`_.


Transfer Note Formats 
---------------------

The sender of each transfer can choose among a multitude of standard
*transfer note formats*. Every transfer note format is identified by a
short string — the format's name [#format-name]_.

The following transfer note formats MUST be supported by all
conforming implementations:

* ``""`` (an empty string)
  
  Indicates that the transfer note contains plain text.
  
* ``"-"`` (a dash)
  
  Indicates that the transfer note contains an absolute
  `Internationalized Resource Identifier`_ (IRI). *Payee reference is
  not specified*.

* ``"."`` (a dot)

  Indicates that the transfer note contains an absolute
  `Internationalized Resource Identifier`_ (IRI), and *this IRI is the
  payee reference*.
  
Other standard transfer note formats shall be defined in their own
specification documents. Transfer note formats fall into two broad
categories:

1. **Non-canonical formats**

   This category includes the plain text format (``""``), and all
   formats whose names start with a dash (``"-"``). For non-canonical
   formats, there are no "a priori" restrictions on the the message
   structure.

2. **Canonical formats**

   This category includes all formats whose names do not start with a
   dash (``"-"``), and have at least one character. For canonical
   formats, the first line [#first-line]_ MUST always refer to *the
   payee reference* from the corresponding payment request.
   
   This simple restriction, imposed on canonical formats' message
   structure, allows the payee to successfully match incoming
   transfers with their corresponding payment requests, even when the
   payer uses *unknown transfer note formats*, as long as they are
   canonical.

.. [#format-name] The transfer note format name MUST match the regular
  expression: `^[0-9A-Za-z.-]{0,8}$`

.. [#first-line] The first line consists of the characters occurring
  before the first CR (Carriage Return, ASCII code 13) or LF (Line
  Feed, ASCII code 10) character.



.. _Swaptacular: https://swaptacular.github.io/overview
.. _machine-readable document: https://en.wikipedia.org/wiki/Machine-readable_document
.. _Swaptacular Messaging Protocol: https://swaptacular.github.io/public/docs/protocol.pdf
.. _URI: https://en.wikipedia.org/wiki/Uniform_Resource_Identifier
.. _Internationalized Resource Identifier: https://en.wikipedia.org/wiki/Internationalized_Resource_Identifier
