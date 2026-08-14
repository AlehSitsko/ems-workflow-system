"""Application-core security: envelope key management, authenticated field
encryption (AES-256-GCM with AAD) and blind indexes for searchable ciphertext.

Pure and infrastructure-only — it knows nothing about EMS domain models. Domain
code obtains a trusted organisation context and asks this layer to encrypt/decrypt;
it never chooses a key itself.
"""
