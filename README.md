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

### Controles

| Tecla | Ação |
|---|---|
| → / D | Pedalar (no ar: girar para frente, precisa apertar de novo depois de decolar) |
| ← / A | Inclinar para trás / girar para trás no ar |
| ↑ / W | Bunny hop (segure para carregar) |
| ↓ / S | Pump / agachar |
| F2 | Colisores (debug draw) |
| F3 | Dados de pouso e FPS |
| R | Voltar à largada |

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
