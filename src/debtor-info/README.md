# debtor-info

This module implements a validating parser and a validating serializer
for `CoinInfo` JSON documents.

# JSON Schema

Type: `object`

<i id="#">path: #</i>

This schema accepts additional properties.

**_Properties_**

 - <b id="#/properties/type">type</b> `required`
	 - Type: `string`
	 - <i id="#/properties/type">path: #/properties/type</i>
	 - The value must match this pattern: `^CoinInfo(-v[1-9][0-9]{0,5})?$`
 - <b id="#/properties/revision">revision</b> `required`
	 - _The revision number. Later revisions must have bigger revision numbers._
	 - Type: `integer`
	 - <i id="#/properties/revision">path: #/properties/revision</i>
	 - Range: between 0 and 2147483647
 - <b id="#/properties/willNotChangeUntil">willNotChangeUntil</b>
	 - _Optional promise that, until the specified moment (in ISO 8601 format), there will be no new revisions of this document._
	 - Type: `string`
	 - <i id="#/properties/willNotChangeUntil">path: #/properties/willNotChangeUntil</i>
	 - String format must be a "date-time"
	 - Length:  &le; 100
 - <b id="#/properties/latestDebtorInfo">latestDebtorInfo</b> `required`
	 - _A link to the newest revision of this currency's debtor info document. (Most probably, a link to the newest revision of this document.)_
	 - <i id="#/properties/latestDebtorInfo">path: #/properties/latestDebtorInfo</i>
	 - &#36;ref: [#/definitions/ShortLink](#/definitions/ShortLink)
 - <b id="#/properties/summary">summary</b>
	 - _A short description of the currency._
	 - Type: `string`
	 - <i id="#/properties/summary">path: #/properties/summary</i>
	 - Length:  &le; 500
 - <b id="#/properties/debtorIdentity">debtorIdentity</b> `required`
	 - _Uniquely identifies the debtor (and the currency). Note that in Swaptacular's terminology, the word "debtor" means a Swaptacular currency with its respective issuer. Therefore, if single issuer (a person or organization) issues multiple currencies, he/she will represent multiple different "debtors"._
	 - <i id="#/properties/debtorIdentity">path: #/properties/debtorIdentity</i>
	 - &#36;ref: [#/definitions/DebtorIdentity](#/definitions/DebtorIdentity)
 - <b id="#/properties/debtorName">debtorName</b> `required`
	 - _The name of the debtor. Should be unambiguous, easy to remember, and unlikely to be duplicated accidentally. Different currencies should have different `debtorName`s, even when they are issued by the same person or organization._
	 - Type: `string`
	 - <i id="#/properties/debtorName">path: #/properties/debtorName</i>
	 - Length: between 1 and 40
 - <b id="#/properties/debtorHomepage">debtorHomepage</b>
	 - _Optional link to the debtor's homepage._
	 - <i id="#/properties/debtorHomepage">path: #/properties/debtorHomepage</i>
	 - &#36;ref: [#/definitions/ShortLink](#/definitions/ShortLink)
 - <b id="#/properties/amountDivisor">amountDivisor</b> `required`
	 - _Before displaying the amount, it should be divided by this number. This value should be used for display purposes only. Notably, the value of this field must be ignored when the exchange rate between pegged currencies is calculated. This field SHOULD NOT change in newer revisions of the document._
	 - Type: `number`
	 - <i id="#/properties/amountDivisor">path: #/properties/amountDivisor</i>
	 - Exclusive Range:  > 0
 - <b id="#/properties/decimalPlaces">decimalPlaces</b> `required`
	 - _The number of digits to show after the decimal point, when displaying the amount. A negative number signifies the number of insignificant digits at the end of the integer number. This field SHOULD NOT change in newer revisions of the document._
	 - Type: `integer`
	 - <i id="#/properties/decimalPlaces">path: #/properties/decimalPlaces</i>
	 - Range: between -20 and 20
 - <b id="#/properties/unit">unit</b> `required`
	 - _The value measurement unit. It should be shown right after the displayed amount, "500.00 USD" for example. This field SHOULD NOT change in newer revisions of the document._
	 - Type: `string`
	 - <i id="#/properties/unit">path: #/properties/unit</i>
	 - Length: between 1 and 40
 - <b id="#/properties/peg">peg</b>
	 - _Optional currency peg. A currency peg is a currency management strategy in which the issuer sets a specific fixed exchange rate between the tokens of his currency (the pegged currency) and the tokens of some other currency (the peg currency)._
	 - <i id="#/properties/peg">path: #/properties/peg</i>
	 - &#36;ref: [#/definitions/Peg](#/definitions/Peg)
 - <b id="#/properties/localization">localization</b>
	 - _Specifies localization dictionaries for different language codes._
	 - Type: `object`
	 - <i id="/properties/localization">path: #/properties/localization</i>
	 - The keys in this object SHOULD be ISO 639 language codes, and
       for each key (language), the value MUST be a localization
       object (ref: [#/definitions/LocalizaionDict](#/definitions/LocalizaionDict)).

# definitions

**_ShortLink_**

 - Type: `object`
 - <i id="#/definitions/ShortLink">path: #/definitions/ShortLink</i>
 - This schema <u>does not</u> accept additional properties.
 - **_Properties_**
	 - <b id="#/definitions/ShortLink/properties/uri">uri</b> `required`
		 - _The IRI (Internationalized Resource Identifier) of the referenced resource. Must be an absolute IRI._
		 - Type: `string`
		 - <i id="#/definitions/ShortLink/properties/uri">path: #/definitions/ShortLink/properties/uri</i>
		 - String format must be a "iri"
		 - Length:  &le; 200


**_DebtorIdentity_**

 - Type: `object`
 - <i id="#/definitions/DebtorIdentity">path: #/definitions/DebtorIdentity</i>
 - This schema accepts additional properties.
 - **_Properties_**
	 - <b id="#/definitions/DebtorIdentity/properties/type">type</b> `required`
		 - Type: `string`
		 - <i id="#/definitions/DebtorIdentity/properties/type">path: #/definitions/DebtorIdentity/properties/type</i>
		 - The value must match this pattern: `^DebtorIdentity(-v[1-9][0-9]{0,5})?$`
	 - <b id="#/definitions/DebtorIdentity/properties/uri">uri</b> `required`
		 - _The information contained in this field must be enough to uniquely and reliably identify the debtor (and the currency). Note that a network request should not be needed to identify the debtor. For example, if the issuer happens to be a bank, the URI would reveal the type of the issuer (a bank), the ID of the bank, and the currency code (USD for example). Note that some debtors may be used only to represent a physical value measurement unit (like ounces of gold). Those dummy debtors do not represent a person or an organization, do not owe anything to anyone, and are used solely as identifiers of value measurement units._
		 - Type: `string`
		 - <i id="#/definitions/DebtorIdentity/properties/uri">path: #/definitions/DebtorIdentity/properties/uri</i>
		 - String format must be a "uri"
		 - Length:  &le; 100


**_PegDisplay_**

 - Type: `object`
 - <i id="#/definitions/PegDisplay">path: #/definitions/PegDisplay</i>
 - This schema accepts additional properties.
 - **_Properties_**
	 - <b id="#/definitions/PegDisplay/properties/type">type</b> `required`
		 - Type: `string`
		 - <i id="#/definitions/PegDisplay/properties/type">path: #/definitions/PegDisplay/properties/type</i>
		 - The value must match this pattern: `^PegDisplay(-v[1-9][0-9]{0,5})?$`
	 - <b id="#/definitions/PegDisplay/properties/amountDivisor">amountDivisor</b> `required`
		 - _The peg currency's `amountDivisor`._
		 - Type: `number`
		 - <i id="#/definitions/PegDisplay/properties/amountDivisor">path: #/definitions/PegDisplay/properties/amountDivisor</i>
		 - Exclusive Range:  > 0
	 - <b id="#/definitions/PegDisplay/properties/decimalPlaces">decimalPlaces</b> `required`
		 - _The peg currency's `decimalPlaces`._
		 - Type: `integer`
		 - <i id="#/definitions/PegDisplay/properties/decimalPlaces">path: #/definitions/PegDisplay/properties/decimalPlaces</i>
		 - Range: between -20 and 20
	 - <b id="#/definitions/PegDisplay/properties/unit">unit</b> `required`
		 - _The peg currency's `unit`._
		 - Type: `string`
		 - <i id="#/definitions/PegDisplay/properties/unit">path: #/definitions/PegDisplay/properties/unit</i>
		 - Length: between 1 and 40


**_Peg_**

 - Type: `object`
 - <i id="#/definitions/Peg">path: #/definitions/Peg</i>
 - This schema accepts additional properties.
 - **_Properties_**
	 - <b id="#/definitions/Peg/properties/type">type</b> `required`
		 - Type: `string`
		 - <i id="#/definitions/Peg/properties/type">path: #/definitions/Peg/properties/type</i>
		 - The value must match this pattern: `^Peg(-v[1-9][0-9]{0,5})?$`
	 - <b id="#/definitions/Peg/properties/exchangeRate">exchangeRate</b> `required`
		 - _The exchange rate between the pegged currency and the peg currency. For example, `2.0` would mean that pegged currency's tokens are twice as valuable as peg currency's tokens._
		 - Type: `number`
		 - <i id="#/definitions/Peg/properties/exchangeRate">path: #/definitions/Peg/properties/exchangeRate</i>
		 - Range:  &ge; 0
	 - <b id="#/definitions/Peg/properties/display">display</b> `required`
		 - _Specifies peg currency's display parameters._
		 - <i id="#/definitions/Peg/properties/display">path: #/definitions/Peg/properties/display</i>
		 - &#36;ref: [#/definitions/PegDisplay](#/definitions/PegDisplay)
	 - <b id="#/definitions/Peg/properties/debtorIdentity">debtorIdentity</b> `required`
		 - _Uniquely identifies the peg currency._
		 - <i id="#/definitions/Peg/properties/debtorIdentity">path: #/definitions/Peg/properties/debtorIdentity</i>
		 - &#36;ref: [#/definitions/DebtorIdentity](#/definitions/DebtorIdentity)
	 - <b id="#/definitions/Peg/properties/latestDebtorInfo">latestDebtorInfo</b> `required`
		 - _A link to the newest revision of the peg currency's debtor info document (a `CoinInfo` document, for example)._
		 - <i id="#/definitions/Peg/properties/latestDebtorInfo">path: #/definitions/Peg/properties/latestDebtorInfo</i>
		 - &#36;ref: [#/definitions/ShortLink](#/definitions/ShortLink)


**_LocalizationDict_**

 - Type: `object`
 - <i id="/definitions/LocalizationDict">path: #/definitions/LocalizationDict</i>
 - This schema accepts additional properties.
 - **_Properties_**
	 - <b id="#/definitions/LocalizationDict/properties/type">type</b> `required`
		 - Type: `string`
		 - <i id="/definitions/LocalizationDict/properties/type">path: #/definitions/LocalizationDict/properties/type</i>
		 - The value must match this pattern: `^LocalizationDict(-v[1-9][0-9]{0,5})?$`
	 - <b id="#/definitions/LocalizationDict/properties/debtorName">debtorName</b>
		 - _The localized name of the debtor._
		 - Type: `string`
		 - <i id="/definitions/LocalizationDict/properties/debtorName">path: #/definitions/LocalizationDict/properties/debtorName</i>
		 - Length: between 1 and 40
	 - <b id="#/definitions/LocalizationDict/properties/summary">summary</b>
		 - _A localized short description of the currency._
		 - Type: `string`
		 - <i id="/definitions/LocalizationDict/properties/summary">path: #/definitions/LocalizationDict/properties/summary</i>
		 - Length:  &le; 500
	 - <b id="#/definitions/LocalizationDict/properties/unit">unit</b>
		 - _The localized value measurement unit._
		 - Type: `string`
		 - <i id="/definitions/LocalizationDict/properties/unit">path: #/definitions/LocalizationDict/properties/unit</i>
		 - Length: between 1 and 40

_Generated with [json-schema-md-doc](https://brianwendt.github.io/json-schema-md-doc/)_
