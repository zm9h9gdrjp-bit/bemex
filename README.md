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
| ↓ / S | Pump: segure no fundo da descida, solte na crista (no ar: agacha para o pouso) |
| F2 / F3 / F4 / F6 | Colisores · dados · sensores de queda · câmera lenta |
| R | Voltar à largada |

## Tela inicial e pistas

- **Tela inicial:** lista das pistas com o perfil do terreno, comprimento, número de vãos e o seu recorde. Toque para correr. Menu → Pistas volta para ela.
- **Pistas:** Pump Track (228 m, rollers e mesa, sem vãos), Circuito de Terra (466 m, 4 vãos), Saltos Grandes (201 m, 2 vãos). Todas validadas pelo piloto automático sem quedas.
- **Contagem 3-2-1** antes de cada largada; a física só começa depois do "VAI".

## Menu, fantasma, desafio, backup e admin

- **Menu** (Esc / P, ou botão Menu no celular): continuar, reiniciar, desafiar um amigo, mostrar fantasma, progresso e admin.
- **Fantasma gravado por inputs:** cada corrida grava só os comandos de cada passo de física (120 Hz) e um ponto de referência a cada 0,5 s. Como cada corrida começa num mundo físico novo, a reprodução é idêntica (testado: erro 0,00000 m ao longo de uma volta com queda e respawn). O melhor tempo da pista fica salvo e corre junto com você, com a distância na tela.
- **Desafio por link:** "Desafiar um amigo" gera um link (~900 caracteres) com o seu melhor fantasma e nome. Quem abre corre contra ele e no fim vê quem venceu e por quanto. Nenhum servidor envolvido.
- **Backup do progresso:** Menu → Progresso mostra um código (`TR1.…`) para copiar ou baixar como arquivo, e restaura a partir de código ou arquivo. O save é versionado e migra versões antigas; save corrompido volta ao padrão sem travar.
- **Offline:** depois da primeira visita o jogo abre sem internet (service worker; só no build publicado).
- **Admin** (Menu → Admin, PIN padrão `1234` em `src/config/dev.ts`): somar, tirar ou definir moedas e gemas, zerar a economia, apagar o recorde da pista.

## Física sem ajudas artificiais

Nenhuma velocidade é somada ou tirada diretamente. Tudo vem de forças reais:

- **Pump:** segurar ↓ estica as pernas e empurra a bike contra o chão; soltar recolhe. Esticando no fundo da transição e recolhendo na crista, a reação do chão acelera a bike (≈ +0,9 m/s numa sequência de rollers); no tempo errado ela perde (≈ −1,5 m/s).
- **Bunny hop:** agacha enquanto segura ↑, ao soltar as pernas empurram a bike contra o chão e depois puxam ela para cima. Roda traseira sobe 25–47 cm conforme a carga.
- **Pouso:** perfeito ou torto é só a classificação; a velocidade que sobra é a que o contato deixa. Sem impulso de pouso perfeito.
- **Equilíbrio:** no chão o piloto desloca o peso e trabalha no guidão (forças internas entre piloto e bike). No ar, sem comando, ele nivela a bike embaixo do corpo. O giro de mortal no ar continua sendo controle de jogo, mas não muda velocidade nem trajetória.
- **Resistência:** só atrito de rolamento do pneu (por superfície); sem arrasto do ar.
- **Respawn** parado no checkpoint, que sempre tem ~20 m de embalo.

## Atualização v2, parte A (A1, A2, A4)

- **Quedas só quando:** o corpo do piloto toca o chão (sensores de cabeça, tronco, quadril, mãos e joelhos), impacto perpendicular acima de 18 m/s, pouso no meio da manobra, ou ângulo acima de ±75°. Pousar numa roda só vira manual / nose manual com medidor de equilíbrio; com a física pura, até ~30° o piloto recupera, mais que isso o peso já passou do eixo e cai. Pouso duro (acima de 9 m/s) perde velocidade sem cair.
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
