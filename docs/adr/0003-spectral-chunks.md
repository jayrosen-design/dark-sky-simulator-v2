# ADR 0003: Five spectral bands as chunks; spectral effects as per-SPD scalars

Status: accepted (v2.0) · 2026-09-26

## Context
PRD 2.1 runs the engine in five AS7341-aligned bands. The seed SPD table (6.2) gives five fractions that sum to 1,
so each fraction stands for a slice of the 380–780 nm spectrum, not a narrow channel.

## Decision
- Chunks: 380–450, 450–520, 520–570, 570–630, 630–780 nm (centers 415, 480, 555, 590, 680).
- For each chunk, the Garstang kernel is integrated over area at the chunk center (Rayleigh λ⁻⁴, aerosol
  Ångström 1.3) and expressed relative to 555 nm.
- Per SPD and output mode (V, scotopic, each band) a scalar per photopic lumen is
  Σ p_b · S(λ_b) · W_mode(b) / Σ p_b · V̄(b), where W is the chunk mean of CIE V or V′.
- The spatial kernel is the 555 nm one for all modes; only the scalar changes.

## Consequences
- V-mode results stay in absolute cd m⁻² for magnitudes; other modes are shown as relative change.
- Chromatic differences in the spatial shape are ignored (blue light is brighter near the source and dimmer far away than the 555 nm kernel implies). A full per-band kernel is the v3.0 Tier 1.
- The VIIRS readout uses the seed `viirs_cf` directly (literature), not the band model.
