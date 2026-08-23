---
title: "A path to human-machine symbiosis"
draft: true
date: 2026-12-31
---

<!-- more -->

## Skills to Develop

- [ ] Interface living neurons with silicon (MEAs, stimulation protocols, closed-loop RL)
- [ ] Show biological learning that beats or complements deep RL
- [ ] Reason about ethics, scaling, and long-term symbiosis (organoids are the closest ethical proxy for "mini-brains")

## Reading List

- [ ] _Principles of Neural Science_
- [ ] _The Synaptic Organization of the Brain_
- [ ] Cortical Labs [DishBrain papers](https://corticallabs.com/research/) — 2024 arXiv showing bio neurons beat PPO in sample efficiency
- [ ] Frontiers in Science OI papers

## Projects

### Project 1: DishBrain Simulator

Build an organoid model with RL to play Pong or a simple memory task.

- [ ] Compare sample efficiency vs DQN/PPO baseline
- [ ] Publish notebook + video

### Project 2: Replicate DishBrain Loop

On real hardware via [FinalSpark Neuroplatform](https://finalspark.com/) — 24/7 remote Python API, 30 kHz spiking, 2.5 mA stimulation, closed-loop dopamine uncaging, 100+ day organoid lifetime. Cortical Labs CL1: Buy the device (~price not public but they sell to labs) or use their cloud. MetaBOC (open-source): Interface layer to make organoids control robots or simulated agents.

- [ ] Feed organoid sparse sensory input (rate-coded position)
- [ ] Reward hits with high-frequency stimulation, punish misses with unpredictable noise
- [ ] Use RL (or simple policy gradients) to optimize stimulation patterns
- [ ] Goal: organoid improves rally length over sessions faster than silicon baseline

### Project 3: Open Contributions

- [ ] Help scale Neuroplatform experiments
- [ ] Release RL-organoid Gym environment
- [ ] Write technical report: "Biological neurons + RL achieve X× sample efficiency vs silicon on task Y"

## Career Path

- Apply to [FinalSpark Neuroplatform](https://finalspark.com/) — Project 1 alone is stronger than 99% of applicants
- Reach out to OI groups: Johns Hopkins, Cortical Labs, FinalSpark, Neuralink
- Many are hiring this exact profile right now

## Resources

### Simulation

- [pyorganoid](https://github.com/spirosChv/pyorganoid)
- [Brian2](https://brian2.readthedocs.io/) — Spiking neural network simulator
- [snnTorch](https://snntorch.readthedocs.io/) — PyTorch-based spiking nets

### Datasets

- [DishBrain Legacy Data](https://osf.io/5u6qv/) — Original MEA recordings from Pong experiments
- [BrainDishSiMulator](https://github.com/neuromorphs/BrainDishSiMulator) — Code + notebooks + data for DishBrain replication
- [FinalSpark 1-Year Dataset](https://finalspark.com/1-year-of-neuronal-activity/) — Continuous spiking data
- [FinalSpark Live](https://finalspark.com/live/) — Real-time MEA broadcast

### Community

- Organoid Intelligence Discord/Slack groups
- Annual OI workshop
