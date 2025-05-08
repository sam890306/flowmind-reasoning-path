// App.jsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Box, Typography } from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faFileAlt,
  faMicrochip,
  faSearch,
  faChartPie,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";

const steps = [
  {
    icon: faExclamationTriangle,
    title: "A critical ticket just came in —",
    description: "the customer's dashboard blew up.",
    position: { top: 40, left: 60 },
  },
  {
    icon: faFileAlt,
    title: "Flow Mind scans the HAR file",
    description: "and detects a 504 Gateway Timeout.",
    position: { top: 140, left: 60 },
  },
  {
    icon: faMicrochip,
    title: "But the AI doesn't stop there —",
    description: "it checks telemetry, traces, and error trends.",
    position: { top: 90, left: 440 },
  },
  {
    icon: faSearch,
    title: "It recalls a past incident —",
    description: "ticket #230678 — where a similar fix was applied.",
    position: { top: 190, left: 440 },
  },
  {
    icon: faChartPie,
    title: "Observability Dashboard",
    description: "It identifies that a backend pod is stuck —",
    position: { top: 290, left: 60 },
  },
  {
    icon: faCheckCircle,
    title: "MTTR reduced",
    description: "What used to take hours — now resolved",
    position: { top: 340, left: 440 },
  },
];

export default function App() {
  const [visibleSteps, setVisibleSteps] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleSteps((prev) => {
        if (prev < steps.length) return prev + 1;
        clearInterval(interval);
        return prev;
      });
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ position: "relative", background: "#0a0d1c", minHeight: "100vh" }}>
      <Typography
        variant="h4"
        color="white"
        fontWeight={600}
        textAlign="center"
        pt={4}
        mb={2}
      >
        🧠 AI-Driven Root Cause Path
      </Typography>

      {steps.slice(0, visibleSteps).map((step, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: idx * 0.2 }}
          style={{
            position: "absolute",
            top: step.position.top,
            left: step.position.left,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 12,
            padding: "16px 24px",
            width: 300,
            boxShadow: "0 0 12px rgba(0,255,255,0.3)",
          }}
        >
          <FontAwesomeIcon icon={step.icon} color="#00eaff" size="lg" />
          <Typography variant="subtitle1" color="white" fontWeight={600} mt={1}>
            {step.title}
          </Typography>
          <Typography variant="body2" color="#ccc">
            {step.description}
          </Typography>
        </motion.div>
      ))}

      <svg
        width="100%"
        height="600"
        style={{ position: "absolute", top: 0, left: 0, zIndex: 0 }}
      >
        {visibleSteps > 2 && (
          <motion.path
            d="M360,60 L440,60 Q460,60 460,90"
            stroke="#00eaff"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1 }}
          />
        )}
        {visibleSteps > 3 && (
          <motion.path
            d="M360,160 L440,160 Q460,160 460,190"
            stroke="#00eaff"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1 }}
          />
        )}
        {visibleSteps > 4 && (
          <motion.path
            d="M360,240 L440,240 Q460,240 460,290"
            stroke="#00eaff"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1 }}
          />
        )}
        {visibleSteps > 5 && (
          <motion.path
            d="M360,340 L440,340 Q460,340 460,370"
            stroke="#00eaff"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1 }}
          />
        )}
      </svg>
    </Box>
  );
}
