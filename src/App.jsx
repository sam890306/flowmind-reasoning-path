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
    title: "Critical Ticket",
    description: "Customer's dashboard blew up.",
  },
  {
    icon: faFileAlt,
    title: "504 Detected",
    description: "From HAR file analysis.",
  },
  {
    icon: faMicrochip,
    title: "AI Reasoning",
    description: "Checked logs, traces, metrics.",
  },
  {
    icon: faSearch,
    title: "Matched Ticket #230678",
    description: "Found prior incident and fix.",
  },
  {
    icon: faChartPie,
    title: "Observability Dashboard",
    description: "Pod timeout at 60s.",
  },
  {
    icon: faCheckCircle,
    title: "MR Generated + Executed",
    description: "MTTR: Hours → Seconds.",
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
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{background: "transparent", minHeight: "100vh", py: 8, px: 4 }}>
      <Typography
        variant="h4"
        color="white"
        fontWeight={600}
        textAlign="center"
        mb={6}
      >
        FlowMind AI Inference Path
      </Typography>
      <Box
        display="flex"
        flexDirection="row"
        justifyContent="center"
        alignItems="center"
        gap={3}
        flexWrap="nowrap"
        position="relative"
        overflow="auto"
        px={4}
      >
        {steps.slice(0, visibleSteps).map((step, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            style={{ position: "relative", zIndex: 2 }}
          >
            <Box
              sx={{
                background: "rgba(255,255,255,0.05)",
                borderRadius: 3,
                p: 2,
                width: 180,
                textAlign: "center",
                boxShadow: "0 0 8px rgba(0,255,255,0.2)",
              }}
            >
              <FontAwesomeIcon icon={step.icon} color="#00eaff" size="lg" />
              <Typography variant="subtitle2" color="white" fontWeight={600} mt={1}>
                {step.title}
              </Typography>
              <Typography variant="caption" color="#ccc">
                {step.description}
              </Typography>
            </Box>
            {idx < visibleSteps - 1 && (
              <Box
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: "100%",
                  width: 30,
                  height: 2,
                  background: "#00eaff",
                  opacity: 0.4,
                  zIndex: 1,
                  transform: "translateY(-50%)",
                }}
              />
            )}
          </motion.div>
        ))}
      </Box>
    </Box>
  );
}
