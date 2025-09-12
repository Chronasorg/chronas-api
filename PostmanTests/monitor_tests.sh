#!/bin/bash

# Test monitoring script - runs tests every 30 seconds for 5 minutes
echo "Starting API test monitoring - 5 minutes, every 30 seconds"
echo "Results will be saved to test_monitoring_results.html"

# Initialize variables
RESULTS_FILE="test_monitoring_results.html"
TEMP_DIR="temp_results"
mkdir -p $TEMP_DIR

# Initialize HTML file
cat > $RESULTS_FILE << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Chronas API Test Monitoring Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 20px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center; border-left: 4px solid #4CAF50; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .metric .value { font-size: 24px; font-weight: bold; color: #4CAF50; }
        .results-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .results-table th, .results-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .results-table th { background-color: #4CAF50; color: white; }
        .success { color: #4CAF50; font-weight: bold; }
        .warning { color: #ff9800; font-weight: bold; }
        .error { color: #f44336; font-weight: bold; }
        .chart-container { margin: 20px 0; text-align: center; }
        .performance-chart { display: inline-block; margin: 10px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Chronas API Test Monitoring Results</h1>
            <p>Comprehensive API testing every 30 seconds for 5 minutes</p>
            <p><strong>Test Suite:</strong> Enhanced Postman Collection (40 requests, 70 assertions)</p>
        </div>
        
        <div class="summary">
            <div class="metric">
                <h3>📊 Total Test Runs</h3>
                <div class="value" id="totalRuns">0</div>
            </div>
            <div class="metric">
                <h3>✅ Success Rate</h3>
                <div class="value" id="successRate">0%</div>
            </div>
            <div class="metric">
                <h3>⚡ Avg Response Time</h3>
                <div class="value" id="avgResponseTime">0ms</div>
            </div>
            <div class="metric">
                <h3>🎯 Total Assertions</h3>
                <div class="value" id="totalAssertions">0</div>
            </div>
        </div>

        <h2>📈 Test Results Timeline</h2>
        <table class="results-table">
            <thead>
                <tr>
                    <th>Run #</th>
                    <th>Timestamp</th>
                    <th>Duration</th>
                    <th>Requests</th>
                    <th>Assertions</th>
                    <th>Failures</th>
                    <th>Success Rate</th>
                    <th>Avg Response Time</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody id="resultsBody">
EOF

# Run tests for 5 minutes (10 runs, every 30 seconds)
TOTAL_RUNS=10
RUN_COUNT=0
TOTAL_DURATION=0
TOTAL_RESPONSE_TIME=0
TOTAL_ASSERTIONS=0
TOTAL_FAILURES=0
SUCCESSFUL_RUNS=0

for i in $(seq 1 $TOTAL_RUNS); do
    RUN_COUNT=$i
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "Run $RUN_COUNT/$TOTAL_RUNS at $TIMESTAMP"
    
    # Run newman test and capture output
    RESULT_FILE="$TEMP_DIR/result_$i.json"
    newman run chronas-enhanced.postman_collection.json -e chronas-api.postman_environment.json \
        --timeout-request 10000 --delay-request 100 --reporters json \
        --reporter-json-export $RESULT_FILE > /dev/null 2>&1
    
    # Parse results
    if [ -f "$RESULT_FILE" ]; then
        DURATION=$(jq -r '.run.timings.completed - .run.timings.started' $RESULT_FILE 2>/dev/null || echo "0")
        REQUESTS=$(jq -r '.run.stats.requests.total' $RESULT_FILE 2>/dev/null || echo "0")
        ASSERTIONS=$(jq -r '.run.stats.assertions.total' $RESULT_FILE 2>/dev/null || echo "0")
        FAILURES=$(jq -r '.run.stats.assertions.failed' $RESULT_FILE 2>/dev/null || echo "0")
        AVG_RESPONSE=$(jq -r '[.run.executions[].response.responseTime] | add / length' $RESULT_FILE 2>/dev/null || echo "0")
        
        # Calculate success rate for this run
        if [ "$ASSERTIONS" -gt 0 ]; then
            SUCCESS_RATE=$(echo "scale=1; (($ASSERTIONS - $FAILURES) * 100) / $ASSERTIONS" | bc -l 2>/dev/null || echo "0")
        else
            SUCCESS_RATE="0"
        fi
        
        # Determine status
        if [ "$FAILURES" -eq 0 ]; then
            STATUS="✅ SUCCESS"
            STATUS_CLASS="success"
            SUCCESSFUL_RUNS=$((SUCCESSFUL_RUNS + 1))
        else
            STATUS="❌ FAILED ($FAILURES failures)"
            STATUS_CLASS="error"
        fi
        
        # Update totals
        TOTAL_DURATION=$(echo "$TOTAL_DURATION + $DURATION" | bc -l 2>/dev/null || echo "$TOTAL_DURATION")
        TOTAL_RESPONSE_TIME=$(echo "$TOTAL_RESPONSE_TIME + $AVG_RESPONSE" | bc -l 2>/dev/null || echo "$TOTAL_RESPONSE_TIME")
        TOTAL_ASSERTIONS=$((TOTAL_ASSERTIONS + ASSERTIONS))
        TOTAL_FAILURES=$((TOTAL_FAILURES + FAILURES))
        
        # Format duration
        DURATION_MS=$(echo "scale=0; $DURATION / 1" | bc -l 2>/dev/null || echo "0")
        AVG_RESPONSE_ROUNDED=$(echo "scale=0; $AVG_RESPONSE / 1" | bc -l 2>/dev/null || echo "0")
        
        # Add row to HTML
        cat >> $RESULTS_FILE << EOF
                <tr>
                    <td>$RUN_COUNT</td>
                    <td>$TIMESTAMP</td>
                    <td>${DURATION_MS}ms</td>
                    <td>$REQUESTS</td>
                    <td>$ASSERTIONS</td>
                    <td>$FAILURES</td>
                    <td>${SUCCESS_RATE}%</td>
                    <td>${AVG_RESPONSE_ROUNDED}ms</td>
                    <td class="$STATUS_CLASS">$STATUS</td>
                </tr>
EOF
    else
        # Test failed to run
        cat >> $RESULTS_FILE << EOF
                <tr>
                    <td>$RUN_COUNT</td>
                    <td>$TIMESTAMP</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td class="error">❌ TEST FAILED TO RUN</td>
                </tr>
EOF
    fi
    
    # Wait 30 seconds before next run (except for last run)
    if [ $i -lt $TOTAL_RUNS ]; then
        echo "Waiting 30 seconds..."
        sleep 30
    fi
done

# Calculate final statistics
if [ $RUN_COUNT -gt 0 ]; then
    OVERALL_SUCCESS_RATE=$(echo "scale=1; ($SUCCESSFUL_RUNS * 100) / $RUN_COUNT" | bc -l 2>/dev/null || echo "0")
    AVG_DURATION=$(echo "scale=0; $TOTAL_DURATION / $RUN_COUNT" | bc -l 2>/dev/null || echo "0")
    AVG_RESPONSE_FINAL=$(echo "scale=0; $TOTAL_RESPONSE_TIME / $RUN_COUNT" | bc -l 2>/dev/null || echo "0")
else
    OVERALL_SUCCESS_RATE="0"
    AVG_DURATION="0"
    AVG_RESPONSE_FINAL="0"
fi

# Complete HTML file
cat >> $RESULTS_FILE << EOF
            </tbody>
        </table>

        <div class="chart-container">
            <h2>📊 Final Statistics</h2>
            <div class="performance-chart">
                <h3>🎯 Overall Success Rate</h3>
                <div style="font-size: 36px; color: #4CAF50; font-weight: bold;">${OVERALL_SUCCESS_RATE}%</div>
                <p>$SUCCESSFUL_RUNS out of $RUN_COUNT test runs successful</p>
            </div>
            <div class="performance-chart">
                <h3>⚡ Performance</h3>
                <div style="font-size: 24px; color: #2196F3; font-weight: bold;">${AVG_RESPONSE_FINAL}ms</div>
                <p>Average response time across all runs</p>
            </div>
            <div class="performance-chart">
                <h3>🔍 Total Coverage</h3>
                <div style="font-size: 24px; color: #FF9800; font-weight: bold;">$TOTAL_ASSERTIONS</div>
                <p>Total assertions executed ($TOTAL_FAILURES failures)</p>
            </div>
        </div>

        <div style="margin-top: 30px; padding: 20px; background: #e8f5e8; border-radius: 5px;">
            <h3>📋 Test Summary</h3>
            <ul>
                <li><strong>Test Duration:</strong> 5 minutes (10 runs every 30 seconds)</li>
                <li><strong>Test Suite:</strong> Enhanced Postman Collection</li>
                <li><strong>API Endpoint:</strong> https://api.chronas.org</li>
                <li><strong>Total Test Runs:</strong> $RUN_COUNT</li>
                <li><strong>Successful Runs:</strong> $SUCCESSFUL_RUNS</li>
                <li><strong>Failed Runs:</strong> $((RUN_COUNT - SUCCESSFUL_RUNS))</li>
                <li><strong>Overall Success Rate:</strong> ${OVERALL_SUCCESS_RATE}%</li>
                <li><strong>Total Assertions:</strong> $TOTAL_ASSERTIONS</li>
                <li><strong>Total Failures:</strong> $TOTAL_FAILURES</li>
                <li><strong>Average Response Time:</strong> ${AVG_RESPONSE_FINAL}ms</li>
            </ul>
        </div>

        <script>
            // Update summary metrics
            document.getElementById('totalRuns').textContent = '$RUN_COUNT';
            document.getElementById('successRate').textContent = '${OVERALL_SUCCESS_RATE}%';
            document.getElementById('avgResponseTime').textContent = '${AVG_RESPONSE_FINAL}ms';
            document.getElementById('totalAssertions').textContent = '$TOTAL_ASSERTIONS';
        </script>

        <footer style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666;">
            <p>Generated on $(date) | Chronas API Test Monitoring</p>
        </footer>
    </div>
</body>
</html>
EOF

# Cleanup
rm -rf $TEMP_DIR

echo ""
echo "✅ Test monitoring completed!"
echo "📊 Results saved to: $RESULTS_FILE"
echo "🎯 Overall Success Rate: ${OVERALL_SUCCESS_RATE}%"
echo "⚡ Average Response Time: ${AVG_RESPONSE_FINAL}ms"
echo "📈 Total Test Runs: $RUN_COUNT"
echo ""
echo "Open $RESULTS_FILE in your browser to view the detailed results."
