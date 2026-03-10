# LLM Evaluation Demo Code

This sample code demonstrates my approach to building LLM evaluation frameworks, created as part of my application for the AI Evaluations research internship at Existential Risk Observatory.

## What This Demonstrates

1. **Clean, Modular Design**: The code is structured with clear separation of concerns using classes and dataclasses.

2. **Evaluation Framework Structure**: Shows understanding of key evaluation concepts:
   - Test suites with multiple test cases
   - Scoring functions for different evaluation types
   - Result aggregation and reporting
   - Reproducibility through session tracking

3. **Python Best Practices**:
   - Type hints for clarity
   - Comprehensive docstrings
   - Proper logging
   - Error handling considerations
   - JSON-based configuration for flexibility

4. **Safety-Focused Evaluation**: The example focuses on safety refusal behavior, directly relevant to ERO's mission.

## Key Features

- **Extensible Design**: Easy to add new scoring functions and evaluation types
- **Reproducible Results**: Session IDs and timestamps for tracking
- **Detailed Logging**: Clear progress indicators and debugging information
- **Flexible Configuration**: JSON-based test suites for easy modification

## Real-World Extensions

In a production environment, this framework would be extended with:

- Actual model loading using Hugging Face Transformers
- Integration with existing evaluation suites (AgentHarm, OpenAI evals)
- More sophisticated scoring functions
- Statistical analysis of results
- Comparison across multiple models
- Visualization of results
- Parallel evaluation for efficiency

## Running the Demo

```bash
python llm_evaluation_demo.py
```

This will:
1. Create an example evaluation suite
2. Run the evaluation (with simulated responses)
3. Save detailed results to JSON
4. Print a summary

## Note on Simulation

For this demo, model responses are simulated to show the framework structure without requiring actual model loading. In practice, the `generate_response` method would use real transformer models.

## Why This Approach

This design prioritizes:
- **Clarity**: Easy to understand and modify
- **Extensibility**: Simple to add new evaluation types
- **Reproducibility**: All results are tracked and saved
- **Practicality**: Focuses on getting useful results quickly

This aligns with ERO's goals of practical, impactful AI safety research.