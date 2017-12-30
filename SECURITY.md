# Parse Community Vulnerability Disclosure Program
If you believe you have found a security vulnerability on one of parse-community maintained packages,
we encourage you to let us know right away. 
We will investigate all legitimate reports and do our best to quickly fix the problem. 
Before reporting though, please review this page including and those things that should not be reported.

# Responsible Disclosure Policy
If you comply with the policies below when reporting a security issue to parse community, 
we will not initiate a lawsuit or law enforcement investigation against you in response to your report.
We ask that: 

- You give us reasonable time to investigate and mitigate an issue you report before making public any information about the report or sharing such information with others. This means we request _at least_ **7 days** to get back to you with an initial response and _at least_ **30 days** from initial contact (made by you) to apply a patch.
- You do not interact with an individual account (which includes modifying or accessing data from the account) if the account owner has not consented to such actions.
- You make a good faith effort to avoid privacy violations and disruptions to others, including (but not limited to) destruction of data and interruption or degradation of our services.
- You do not exploit a security issue you discover for any reason. (This includes demonstrating additional risk, such as attempted compromise of sensitive company data or probing for additional issues). You do not violate any other applicable laws or regulations.

# Communicating with us

All vulnerability should be privately reported to either [Node Security](https://nodesecurity.io/report) or directly to us at the following address [security at parseplatform dot org](mailto:security@parseplatform.org)

You can use our PGP public key, which is also uploaded [here](hkp://pgp.mit.edu):

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

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
=o7Nx
-----END PGP PUBLIC KEY BLOCK-----
```
