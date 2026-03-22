interface WheelSegment {
    id:          string;
    name:        string;
    color:       string;       // label color (reserved for future use)
    borderColor: string;       // segment fill color
    weight:      number;       // relative weight (any positive number, will be normalised)
}