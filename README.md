# Dealpong

Jogo estilo console: duas raquetes horizontais e uma bola. Pontos por tapa (× velocidade). Ranking vs IA em Postgres.

## Controles

- **Baixo (P1):** ← → ou A/D, ou arrastar no touch
- **Cima (P2):** J/L (modo 2 jogadores)
- **Espaço:** iniciar / pausar
- Iniciais (5 chars) no vs IA ficam em cookie; **New player** troca

## Local

```bash
python -m pip install -r requirements.txt
python migrate.py
python server.py
```

Abra http://localhost:8080
