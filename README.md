# Trick Riders: World Tour

Jogo 2D de corrida e manobras de BMX, visão lateral, rodando no navegador (desktop e celular).
TypeScript + Vite + PixiJS v8 + Planck.js.

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173 (também exposto na rede local para testar no celular)
npm run build      # build de produção em dist/
npm run typecheck
```

## Jogar no iPhone

A cada push, o workflow `.github/workflows/pages.yml` gera o build e publica na branch `gh-pages`.

1. Uma vez só: no GitHub, **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `gh-pages`, pasta `/ (root)`, **Save**.
2. Abra https://zm9h9gdrjp-bit.github.io/bemex/ no Safari.
3. Para tela cheia na horizontal: botão Compartilhar → **Adicionar à Tela de Início**, e abra pelo ícone.

No celular: polegar esquerdo com **Pedal** embaixo e **Trás / Frente** logo acima (dá para deslizar o dedo do pedal para a inclinação sem soltar); polegar direito com **Pulo** (segure para carregar) e **Pump**. **Reiniciar** e **Dados** ficam no canto superior direito; em **Dados** há botões de Colisores, Sensores, Ossos e Câmera lenta. Em retrato o jogo pausa e pede para girar.

## Estado atual: Milestone 1, protótipo de física

- Bike com quadro + 2 rodas em wheel joints com suspensão (mola e amortecimento ajustados pela massa suspensa).
- Pedal (motor na roda traseira), inclinação no chão (manual / nose manual) e rotação controlada no ar.
- Bunny hop com carga (segurar ↑), pump na descida (↓) com ganho de velocidade.
- Detecção de pouso: perfeito (as duas rodas em até 80 ms e ângulo ±10°, dá impulso), limpo (±25°), torto (±45°, perde velocidade e balança), queda (>45°, cabeça no chão ou queda no vão).
- Queda vira ragdoll de 6 partes com juntas limitadas; respawn no último checkpoint após 1,5 s, tempo perdido somado no cronômetro.
- Checkpoints automáticos a cada ~15% da pista, sempre em trecho plano.
- Pista de teste em JSON (spline Catmull-Rom centrípeta → chain shapes), com rollers, kicker, vão, mesa, step-up, step-down e mega jump.
- Câmera com look-ahead, piloto no terço esquerdo, zoom out por velocidade e altura, tremor na queda.
- Debug draw dos colisores, juntas e pontos de contato; painel com FPS, gráfico de frame time, tempo no ar, rotação e ângulo de pouso.
- Teclado, toque (aparece sozinho em telas touch) e gamepad padrão.

### Controles (teclado)

| Tecla | Ação |
|---|---|
| → / D | Pedalar |
| A / Q (ou ←) | Inclinar para trás · mortal para trás no ar |
| E / F | Inclinar para frente · mortal para frente no ar |
| ↑ / W | Bunny hop (segure para carregar) |
| ↓ / S | Pump (na descida ganha, na subida perde) |
| F2 / F3 / F4 / F6 | Colisores · dados · sensores de queda · câmera lenta |
| R | Voltar à largada |

## Atualização v2, parte A (A1, A2, A4)

- **Quedas só quando:** o corpo do piloto toca o chão (sensores de cabeça, tronco, quadril, mãos e joelhos), impacto perpendicular acima de 18 m/s, pouso no meio da manobra, ou ângulo acima de ±75°. Pousar numa roda só vira manual / nose manual com medidor de equilíbrio; passar de 80° para trás ou 70° para frente derruba. Pouso duro (acima de 9 m/s) perde velocidade sem cair.
- **Piloto como corpo separado** (65 kg) preso à bike (11 kg, rodas de 1 kg) por molas: pernas e braços absorvem o pouso e a inclinação move o peso de verdade.
- **Pedalada para frente** pela relação 25/9, pedivelas niveladas ao soltar, pés presos aos pedais por IK, joelhos para frente.
- **Geometria de BMX 20"**, 36 raios, coroa, catraca e corrente animada; renderização interpolada a 120 Hz de física.
- Respawn em 1,2 s com fade, toque para voltar antes, contador de quedas e motivo da queda na tela.

## Estrutura

```
src/config     valores de ajuste (física, câmera, pouso)
src/core       loop, input, i18n
src/physics    bike, terreno, pouso, pose do piloto, ragdoll
src/render     câmera, terreno, bike/piloto, parallax, debug draw
src/levels     pistas em JSON
src/ui         HUD, controles de toque, estilos
```

Todos os números de ajuste ficam em `src/config/physics.ts`.
